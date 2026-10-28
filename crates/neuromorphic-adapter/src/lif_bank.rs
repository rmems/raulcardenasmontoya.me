//! Sparse, desynchronised firing for the browser LIF bank (RM-2352).
//!
//! `neuromod` owns every LIF dynamic: integration, leak, threshold, reset and
//! lateral inhibition. What it does not own is *who is connected to whom* or
//! *how sensitive each neuron is*, and the adapter's first wiring got both
//! wrong in a way that read as a strobe:
//!
//! * every neuron listened to every channel through identical weights, so all
//!   16 saw the same mean current and crossed the same threshold in the same
//!   step (15.99 of 16 spikes per tick in `delta` and `rate`);
//! * `neuromod` takes `|current|`, so an inhibitory edge of the audited
//!   `synaptic-wiring` topology drove its target *up*, not down;
//! * `neuromod` has no refractory period, so a neuron could fire on
//!   consecutive steps for as long as the drive lasted;
//! * nothing drove the bank between presses, so `temporal` mode sat silent.
//!
//! [`LifBankShaping`] fixes those four things using only the public
//! `neuromod` surface (`neurons[i].weights` and `.threshold`) and the
//! `synaptic-wiring` currents. It adds no spike of its own: every reported
//! spike is a `neuromod` threshold crossing.
//!
//! 1. **One synapse per neuron.** Neuron `i` is wired to channel `i` only, so
//!    it is driven by exactly the synaptic current `synaptic-wiring` routed to
//!    it. The weight is the full L1 budget, so `neuromod`'s renormalization is
//!    an exact no-op.
//! 2. **Inhibition stays inhibition.** Net negative current is clamped to
//!    zero (a shunt) before it reaches `neuromod`, instead of being
//!    rectified into excitation.
//! 3. **Heterogeneous excitability.** Thresholds and evoked gains differ per
//!    neuron by a fixed low-discrepancy sequence, so a shared input recruits
//!    the sensitive neurons first rather than all of them at once.
//! 4. **Absolute refractory period.** For [`REFRACTORY_STEPS`] steps after a
//!    spike the neuron's synaptic weights are withheld, so no drive reaches it
//!    (it cannot fire on consecutive steps). They are restored before the step
//!    returns, so the weights `neuromod` reports never change.
//! 5. **Background drive.** Each neuron receives a small tonic current just
//!    above its own rheobase, so it fires slowly and at its own period even
//!    with no input. That is what keeps pulses visible between presses.
//!
//! Everything is a pure function of the neuron index: no entropy, no clock.

use neuromod::{NeuroModulators, Rng, SpikingNetwork, StepError};

/// Steps a neuron stays silent after it fires. A neuron that spikes at step
/// `t` receives no drive at steps `t + 1` and `t + 2`, so the shortest
/// inter-spike interval is [`REFRACTORY_STEPS`] + 1.
pub const REFRACTORY_STEPS: u8 = 2;

/// `neuromod`'s L1 weight budget (`WEIGHT_BUDGET`). One synapse per neuron at
/// exactly this weight keeps its renormalization an exact no-op.
const WEIGHT_BUDGET: f32 = 2.0;

/// `neuromod` multiplies the weighted stimulus by this before integrating
/// (`total_current *= 0.45 * stress_multiplier`, with the default modulators).
const INTEGRATION_GAIN: f32 = 0.45;

/// `neuromod`'s LIF leak per step with the default modulators
/// (`decay_rate = 0.15`).
const LEAK: f32 = 0.15;

/// Resting threshold range. `neuromod` clamps every LIF threshold to
/// `[0.05, 0.50]` each step.
const THRESHOLD_FLOOR: f32 = 0.15;
const THRESHOLD_SPREAD: f32 = 0.20;

/// Relative spread of the evoked-input gain across the bank.
const EVOKED_GAIN_SPREAD: f32 = 0.8;

/// Per-neuron spread of the tonic drive, as a fraction of rheobase, on top
/// of the profile's multiple.
const TONIC_RHEOBASE_SPREAD: f32 = 0.5;

/// The two shaping constants that set the bank's firing rate, chosen per
/// contract (the topology size they were tuned for). Everything else in this
/// module (spreads, refractory period, dither, thresholds) is shared.
///
/// `neuromod`'s lateral inhibition is global: every non-firing neuron is
/// pushed down whenever any neuron fires. A larger bank fires on more steps,
/// so each neuron is inhibited more often and the same drive yields a lower
/// per-neuron rate; the larger topology's profile compensates with a stronger
/// tonic drive. The legacy profile is frozen: it is part of what the
/// contract-3 to -6 goldens pin.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShapingProfile {
    /// Tonic drive as a multiple of each neuron's rheobase (the constant
    /// stimulus whose steady-state membrane equals its threshold). Above 1 so
    /// every neuron fires on its own, close enough to 1 that the periods are
    /// long and differ.
    pub tonic_rheobase_multiple: f32,
    /// Mean evoked-input gain: how much of the routed synaptic current reaches
    /// `neuromod`.
    pub evoked_gain: f32,
    /// Relative step-to-step modulation of the background drive. Lateral
    /// inhibition couples every neuron's phase, which locks a uniform bank
    /// onto shared periods; a deterministic dither keeps the phases apart.
    pub tonic_dither: f32,
}

impl ShapingProfile {
    /// The 16-neuron bank of contracts 3 to 6 (RM-2352).
    pub const LEGACY: Self = Self {
        tonic_rheobase_multiple: 1.2,
        evoked_gain: 0.09,
        tonic_dither: 0.3,
    };
    /// The 48-neuron bank of contract 7 (RM-2355). With the legacy profile a
    /// 48-neuron bank fired 60 to 99 spikes per 40-step window in the default
    /// mode (the floor is 96) and left up to 19 neurons silent: with three
    /// times the neurons, some neuron fires on nearly every step, so the
    /// global inhibition lands on every step and a tonic drive 1.2× rheobase
    /// never gets a quiet step to climb through. A 2.1× drive climbs through
    /// the inhibition on its own; the evoked gain is lowered so pointer input
    /// raises the rate without saturating the band; and a stronger dither
    /// keeps the larger bank from bunching (at 0.3 one idle step in 2,400
    /// recruited 25 of 48 neurons, at 0.6 the peak is 19). `tests/sparse_firing.rs`
    /// holds the result to 96 to 384 spikes per window (5 to 20 % of 48
    /// neurons per step); the sweep that chose these values is recorded in
    /// `docs/architecture/browser-runtime.md`.
    pub const V7: Self = Self {
        tonic_rheobase_multiple: 2.1,
        evoked_gain: 0.04,
        tonic_dither: 0.6,
    };
}

/// Fractional parts of multiples of these irrationals are well spread and
/// need no RNG.
const GOLDEN_THRESHOLD: f32 = 0.618_034;
const GOLDEN_TONIC: f32 = 0.381_966;
const GOLDEN_GAIN: f32 = 0.754_878;
const GOLDEN_PHASE: f32 = 0.569_840;

/// Largest starting membrane potential as a fraction of the neuron's own
/// threshold.
const INITIAL_PHASE: f32 = 0.9;

/// A deterministic `[0, 1)` value for a (neuron, step) pair (splitmix64).
fn unit_hash(index: u64, step: u64) -> f32 {
    let mut z = index
        .wrapping_mul(0x9E37_79B9_7F4A_7C15)
        .wrapping_add(step.wrapping_mul(0xBF58_476D_1CE4_E5B9))
        .wrapping_add(0x94D0_49BB_1331_11EB);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^= z >> 31;
    (z >> 40) as f32 / (1_u64 << 24) as f32
}

fn spread(index: usize, step: f32, offset: f32) -> f32 {
    (index as f32 * step + offset).fract()
}

/// Per-neuron shaping state for one [`SpikingNetwork`] LIF bank.
#[derive(Clone, Debug)]
pub struct LifBankShaping {
    /// Weights each neuron owns, restored after every step.
    home_weights: Vec<Vec<f32>>,
    /// Constant per-neuron stimulus (background drive).
    tonic: Vec<f32>,
    /// Per-neuron multiplier on the routed synaptic current.
    gain: Vec<f32>,
    /// The profile's background-drive dither.
    tonic_dither: f32,
    /// Remaining silent steps per neuron.
    refractory_left: Vec<u8>,
    /// Steps `stimulus` has been called for; seeds the background dither.
    steps: u64,
}

impl LifBankShaping {
    /// Wire `network` (one synapse per neuron, spread thresholds) with the
    /// legacy 16-neuron profile and return the shaping state that drives it.
    pub fn install(network: &mut SpikingNetwork) -> Self {
        Self::install_with(network, ShapingProfile::LEGACY)
    }

    /// Wire `network` (one synapse per neuron, spread thresholds) with
    /// `profile` and return the shaping state that drives it.
    pub fn install_with(network: &mut SpikingNetwork, profile: ShapingProfile) -> Self {
        let neurons = network.neurons.len();
        let channels = network.num_channels;
        let mut home_weights = Vec::with_capacity(neurons);
        let mut tonic = Vec::with_capacity(neurons);
        let mut gain = Vec::with_capacity(neurons);
        for (index, neuron) in network.neurons.iter_mut().enumerate() {
            let mut weights = vec![0.0_f32; channels];
            if let Some(own) = weights.get_mut(index) {
                *own = WEIGHT_BUDGET;
            }
            neuron.weights.clone_from(&weights);
            home_weights.push(weights);

            let threshold = (THRESHOLD_FLOOR
                + THRESHOLD_SPREAD * spread(index, GOLDEN_THRESHOLD, 0.3))
            .clamp(0.05, 0.50);
            neuron.threshold = threshold;
            neuron.base_threshold = threshold;
            // Start each membrane at its own fraction of threshold so the
            // bank does not charge in lockstep and flash at load.
            neuron.membrane_potential =
                INITIAL_PHASE * threshold * spread(index, GOLDEN_PHASE, 0.7);

            // Steady state of a constant stimulus `s` is
            // `s * WEIGHT_BUDGET * INTEGRATION_GAIN * (1 - LEAK) / LEAK`.
            let per_unit_stimulus = WEIGHT_BUDGET * INTEGRATION_GAIN * (1.0 - LEAK) / LEAK;
            let multiple = profile.tonic_rheobase_multiple
                + TONIC_RHEOBASE_SPREAD * spread(index, GOLDEN_TONIC, 0.1);
            tonic.push(multiple * threshold / per_unit_stimulus);

            gain.push(
                profile.evoked_gain
                    * (1.0 - EVOKED_GAIN_SPREAD
                        + 2.0 * EVOKED_GAIN_SPREAD * spread(index, GOLDEN_GAIN, 0.2)),
            );
        }
        Self {
            home_weights,
            tonic,
            gain,
            tonic_dither: profile.tonic_dither,
            refractory_left: vec![0; neurons],
            steps: 0,
        }
    }

    /// Advance `network` one step from `synaptic-wiring` currents: shape the
    /// stimulus, withhold refractory neurons' weights, run `neuromod`, then
    /// restore the weights and start the refractory period of every neuron that
    /// fired.
    ///
    /// Atomic like `neuromod`'s own step: when `neuromod` rejects the step
    /// (wrong current count, non-finite value) the weights are restored and
    /// neither the dither step nor the refractory counters advance, so a retry
    /// behaves exactly as if the failed call never happened.
    pub fn step<R: Rng + ?Sized>(
        &mut self,
        network: &mut SpikingNetwork,
        currents: &[f32],
        modulators: &NeuroModulators,
        rng: &mut R,
    ) -> Result<Vec<usize>, StepError> {
        let stimulus = self.stimulus(currents);
        self.enter_step(network);
        let stepped = network.step_with_rng(&stimulus, modulators, rng);
        self.restore_weights(network);
        if let Ok(spikes) = &stepped {
            self.settle(spikes);
        }
        stepped
    }

    /// Turn `synaptic-wiring` currents into the stimulus handed to `neuromod`:
    /// inhibition clamped to zero, a per-neuron gain, plus background drive.
    /// `neuromod` clamps each channel to `[0, 1]` itself, so no clamp here: the
    /// bank sees exactly this sum, and a non-finite current (NaN or infinite) still
    /// reaches `neuromod`'s own rejection instead of being masked.
    fn stimulus(&self, currents: &[f32]) -> Vec<f32> {
        let step = self.steps;
        currents
            .iter()
            .enumerate()
            .map(|(index, current)| {
                // `f32::max` returns the other operand for NaN, which would turn a
                // NaN current into 0 and hide it from `neuromod`'s rejection, so
                // only finite currents are clamped.
                let current = if current.is_finite() {
                    current.max(0.0)
                } else {
                    *current
                };
                let evoked = current * self.gain.get(index).copied().unwrap_or(0.0);
                let dither = 1.0 + self.tonic_dither * (2.0 * unit_hash(index as u64, step) - 1.0);
                let background = self.tonic.get(index).copied().unwrap_or(0.0) * dither;
                evoked + background
            })
            .collect()
    }

    /// Withhold the synaptic weights of every refractory neuron for the step
    /// that follows.
    fn enter_step(&self, network: &mut SpikingNetwork) {
        for (neuron, left) in network.neurons.iter_mut().zip(&self.refractory_left) {
            if *left > 0 {
                neuron.weights.fill(0.0);
            }
        }
    }

    /// Restore every neuron's own weights after the step.
    fn restore_weights(&self, network: &mut SpikingNetwork) {
        for (neuron, home) in network.neurons.iter_mut().zip(&self.home_weights) {
            neuron.weights.clone_from(home);
        }
    }

    /// Commit a successful step: advance the dither step, age the refractory
    /// counters, and start the refractory period of every neuron that fired.
    fn settle(&mut self, spikes: &[usize]) {
        self.steps = self.steps.wrapping_add(1);
        for left in &mut self.refractory_left {
            *left = left.saturating_sub(1);
        }
        for spike in spikes {
            if let Some(left) = self.refractory_left.get_mut(*spike) {
                *left = REFRACTORY_STEPS;
            }
        }
    }
}
