//! RM-2352 acceptance: sparse, desynchronised firing in the hero network.
//!
//! The telemetry panel shows a 40-step (2 s at the 50 ms demo tick) spike
//! window and a per-neuron list of recent spike steps. This replays the same
//! two inputs the performance harness measures (the scripted Lissajous with a
//! periodic press, and a fast pressed pointer drag) through every encoder mode
//! on the shipped contract 6 runtime, and holds the shipped runtime to the
//! issue's targets.

use neuromorphic_adapter::{
    BrowserRuntime, CONTRACT_VERSION_V6, encoder::EncoderMode, lif_bank::REFRACTORY_STEPS,
};

const SEED: u64 = 20_260_916;
const STEPS: u64 = 2_400;
const WINDOW: usize = 40;
const NEURONS: usize = 16;

#[derive(Clone, Copy)]
enum Input {
    Scripted,
    PointerActive,
}

/// Deterministic jitter in `[-1, 1)`; the same generator as `lcg` in
/// `examples/stage_bench.rs`, so the pointer-active input is the measured one.
fn lcg(sequence: u64) -> f64 {
    let mixed = sequence
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(1_442_695_040_888_963_407);
    ((mixed >> 11) as f64 / (1_u64 << 53) as f64) * 2.0 - 1.0
}

fn packet(input: Input, sequence: u64) -> [f32; 3] {
    let step = sequence as f64;
    match input {
        // Port of `scriptedTelemetry` in `src/runtime/demo-stimulus.ts`.
        Input::Scripted => [
            (0.5 + 0.38 * (step * 0.09).sin()) as f32,
            (0.5 + 0.3 * (step * 0.13 + 0.8).sin()) as f32,
            if sequence % 120 < 24 { 0.5 } else { 0.0 },
        ],
        Input::PointerActive => {
            let jitter = lcg(sequence) * 0.03;
            let sweep = |period: f64| {
                let phase = (step / period).fract();
                if phase < 0.5 {
                    phase * 2.0
                } else {
                    2.0 - phase * 2.0
                }
            };
            [
                (sweep(12.5) + jitter) as f32,
                (sweep(17.0) - jitter) as f32,
                if sequence % 40 < 30 {
                    (0.6 + jitter * 5.0) as f32
                } else {
                    0.0
                },
            ]
        }
    }
}

/// Spike neuron ids per step for `STEPS` steps.
fn trace(input: Input, mode: EncoderMode) -> Vec<Vec<u32>> {
    let mut runtime = BrowserRuntime::with_mode(SEED, mode, CONTRACT_VERSION_V6)
        .expect("the fixed browser topology is valid");
    (1..=STEPS)
        .map(|sequence| {
            runtime
                .input(sequence, &packet(input, sequence))
                .expect("input is accepted");
            runtime.step().expect("runtime can advance").spike_neurons
        })
        .collect()
}

fn cases() -> Vec<(&'static str, Input, EncoderMode)> {
    let mut cases = Vec::new();
    for (name, input) in [
        ("scripted", Input::Scripted),
        ("pointer-active", Input::PointerActive),
    ] {
        for mode in [EncoderMode::Delta, EncoderMode::Temporal, EncoderMode::Rate] {
            cases.push((name, input, mode));
        }
    }
    cases
}

#[test]
fn every_two_second_window_holds_between_20_and_120_spikes() {
    for (name, input, mode) in cases() {
        let counts: Vec<usize> = trace(input, mode).iter().map(Vec::len).collect();
        for (start, window) in counts.windows(WINDOW).enumerate() {
            let spikes: usize = window.iter().sum();
            assert!(
                (20..=120).contains(&spikes),
                "{name}/{}: steps {}..{} hold {spikes} spikes",
                mode.name(),
                start + 1,
                start + WINDOW,
            );
        }
    }
}

#[test]
fn no_neuron_fires_inside_its_refractory_period() {
    for (name, input, mode) in cases() {
        let mut last_spike = [None::<usize>; NEURONS];
        for (step, spikes) in trace(input, mode).iter().enumerate() {
            for neuron in spikes {
                let neuron = *neuron as usize;
                if let Some(previous) = last_spike[neuron] {
                    let gap = step - previous;
                    assert!(
                        gap > usize::from(REFRACTORY_STEPS),
                        "{name}/{}: neuron {neuron} fired at steps {previous} and {step}",
                        mode.name(),
                    );
                }
                last_spike[neuron] = Some(step);
            }
        }
    }
}

#[test]
fn the_whole_population_never_fires_in_one_step_and_most_steps_are_sparse() {
    for (name, input, mode) in cases() {
        let counts: Vec<usize> = trace(input, mode).iter().map(Vec::len).collect();
        let peak = counts.iter().copied().max().unwrap_or(0);
        assert!(
            peak < NEURONS,
            "{name}/{}: {peak} of {NEURONS} fired in one step",
            mode.name()
        );
        let dense = counts.iter().filter(|count| **count >= NEURONS / 2).count();
        assert!(
            dense * 100 <= counts.len(),
            "{name}/{}: {dense} of {} steps fired at least half the neurons",
            mode.name(),
            counts.len()
        );
    }
}

#[test]
fn the_network_stays_active_without_a_press() {
    // Idle input: no pressure, a still pointer. Every neuron must still fire
    // (background drive), and no step may recruit half the population.
    let mut runtime =
        BrowserRuntime::with_mode(SEED, EncoderMode::DEFAULT, CONTRACT_VERSION_V6).expect("valid");
    let mut fired = [0_u32; NEURONS];
    let mut peak = 0;
    for sequence in 1..=STEPS {
        runtime
            .input(sequence, &[0.42, 0.58, 0.0])
            .expect("input is accepted");
        let spikes = runtime.step().expect("runtime can advance").spike_neurons;
        peak = peak.max(spikes.len());
        for neuron in spikes {
            fired[neuron as usize] += 1;
        }
    }
    assert!(
        fired.iter().all(|count| *count > 0),
        "silent neurons: {fired:?}"
    );
    assert!(peak < NEURONS / 2, "idle peak was {peak}");
}

#[test]
fn the_same_seed_replays_the_same_spikes() {
    for (_, input, mode) in cases() {
        assert_eq!(trace(input, mode), trace(input, mode));
    }
}

/// A step `neuromod` rejects must leave the shaping state untouched, like
/// `neuromod`'s own atomic step: a bank that suffered rejected steps replays
/// exactly like one that never did.
#[test]
fn a_rejected_step_leaves_the_shaping_state_untouched() {
    use neuromod::{NeuroModulators, SeedableRng, SpikingNetwork, StdRng};
    use neuromorphic_adapter::lif_bank::LifBankShaping;

    let bank = || {
        let mut network = SpikingNetwork::with_dimensions(NEURONS, 0, NEURONS);
        let shaping = LifBankShaping::install(&mut network);
        (network, shaping, StdRng::seed_from_u64(SEED))
    };
    let (mut network_a, mut shaping_a, mut rng_a) = bank();
    let (mut network_b, mut shaping_b, mut rng_b) = bank();
    let modulators = NeuroModulators::default();
    let drive = [0.05_f32; NEURONS];

    let mut spiked = 0;
    for step in 0..200 {
        if step % 3 == 1 {
            // Inputs `neuromod` rejects before changing anything: one current
            // short, and a NaN or infinite current (which the inhibitory clamp
            // must not turn into a valid 0).
            let mut nan = drive;
            nan[step % NEURONS] = f32::NAN;
            let mut infinite = drive;
            infinite[step % NEURONS] = if step % 2 == 0 {
                f32::INFINITY
            } else {
                f32::NEG_INFINITY
            };
            for rejected in [&drive[..NEURONS - 1], &nan[..], &infinite[..]] {
                assert!(
                    shaping_a
                        .step(&mut network_a, rejected, &modulators, &mut rng_a)
                        .is_err(),
                    "step {step}: input {rejected:?} must be rejected"
                );
            }
        }
        let with_failures = shaping_a
            .step(&mut network_a, &drive, &modulators, &mut rng_a)
            .expect("valid step");
        let clean = shaping_b
            .step(&mut network_b, &drive, &modulators, &mut rng_b)
            .expect("valid step");
        assert_eq!(with_failures, clean, "step {step}");
        spiked += clean.len();
    }
    assert!(spiked > 0, "the comparison must exercise spikes");
    assert_eq!(
        network_a.get_membrane_potentials(),
        network_b.get_membrane_potentials()
    );
}
