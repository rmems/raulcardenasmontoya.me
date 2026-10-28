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
            let jitter = ((sequence.wrapping_mul(2_654_435_761) >> 8) & 0xffff) as f64 / 32_768.0;
            let jitter = (jitter - 1.0) * 0.03;
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
