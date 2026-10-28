use neuromorphic_adapter::{
    BrowserRuntime, CONTRACT_VERSION_V5, CONTRACT_VERSION_V6, CONTRACT_VERSION_V7,
    CONTRACT_VERSION_V8, TopologySpec, WasmAdapter, encoder::EncoderMode,
};

const LEGACY_DIGEST: &str = "synaptic-wiring.topology.digest.v1:sha256:26875faf05121b9afda27a533760369da67ba9110599fb61533f08961ff6e971";

#[test]
fn a_seeded_runtime_preserves_topology_provenance_and_advances_deterministically() {
    let mut left = BrowserRuntime::new(9).expect("the fixed browser topology is valid");
    let mut right = BrowserRuntime::new(9).expect("the fixed browser topology is valid");

    left.input(1, &[1.0, 0.0, 0.5, 0.25])
        .expect("input is accepted");
    right
        .input(1, &[1.0, 0.0, 0.5, 0.25])
        .expect("input is accepted");
    let left_state = left.step().expect("runtime can advance one tick");
    let right_state = right.step().expect("runtime can advance one tick");

    assert_eq!(left_state.contract_version, 3);
    assert_eq!(left_state.completed_step, 1);
    assert_eq!(left_state.topology_digest, right_state.topology_digest);
    assert_eq!(left_state.topology_node_ids, right_state.topology_node_ids);
    assert_eq!(
        left_state.topology_edge_sources,
        right_state.topology_edge_sources
    );
    assert_eq!(
        left_state.topology_edge_targets,
        right_state.topology_edge_targets
    );
    assert_eq!(
        left_state.topology_edge_weights,
        right_state.topology_edge_weights
    );
    assert_eq!(
        left_state.topology_edge_delays,
        right_state.topology_edge_delays
    );
    assert_eq!(
        left_state.topology_polarities,
        right_state.topology_polarities
    );
    assert_eq!(
        left_state.topology_weight_bits,
        right_state.topology_weight_bits
    );
    assert_eq!(
        left_state.topology_outgoing_edge_offsets,
        right_state.topology_outgoing_edge_offsets
    );
    assert_eq!(left_state.spike_neurons, right_state.spike_neurons);
    assert_eq!(
        left_state.membrane_potentials,
        right_state.membrane_potentials
    );
    assert_eq!(left_state.topology_digest, LEGACY_DIGEST);
    // The background drive starts the bank part-way to threshold, so a few
    // neurons may fire on step 1, but never the whole population, and every
    // membrane is below the highest threshold `neuromod` allows (0.50).
    assert!(left_state.spike_neurons.len() < 16);
    assert_eq!(left_state.membrane_potentials.len(), 16);
    assert!(
        left_state
            .membrane_potentials
            .iter()
            .all(|potential| potential.is_finite() && *potential >= 0.0 && *potential < 0.50),
        "unexpected potentials: {:?}",
        left_state.membrane_potentials
    );
    assert!(left_state.topology_rows.len() > 1);
    assert_eq!(
        left_state.topology_targets.len(),
        left_state.topology_weights.len()
    );
    assert_eq!(
        left_state.topology_targets.len(),
        left_state.topology_delays.len()
    );
}

#[test]
fn input_sequences_are_monotonic_and_state_is_a_value_snapshot() {
    let mut runtime = BrowserRuntime::new(7).expect("the fixed browser topology is valid");
    runtime
        .input(5, &[0.1, 0.2, 0.3])
        .expect("first input is accepted");
    assert!(runtime.input(5, &[0.4]).is_err());
    assert_eq!(
        runtime.state().error_status,
        "input-sequence-not-increasing"
    );

    let before = runtime.state();
    runtime.step().expect("runtime can advance one tick");
    let after = runtime.state();

    assert_eq!(before.completed_step, 0);
    assert_eq!(after.completed_step, 1);
    assert_eq!(after.last_sequence, 5);
    assert_eq!(after.error_status, "ok");
}

#[test]
fn invalid_input_publishes_a_stable_error_status_without_mutating_the_accepted_sequence() {
    let mut runtime = BrowserRuntime::new(3).expect("the fixed browser topology is valid");

    assert!(runtime.input(0, &[f32::NAN]).is_err());
    let failed_state = runtime.state();
    assert_eq!(failed_state.error_status, "input-non-finite-samples");
    assert_eq!(failed_state.last_sequence, 0);

    runtime
        .input(0, &[0.25])
        .expect("the first valid input is accepted");
    assert_eq!(runtime.state().error_status, "ok");
}

#[test]
fn zero_is_a_valid_first_input_sequence() {
    let mut runtime = BrowserRuntime::new(7).expect("the fixed browser topology is valid");
    runtime
        .input(0, &[0.1, 0.2])
        .expect("zero is a valid first sequence");
    assert!(runtime.input(0, &[0.3]).is_err());
    assert_eq!(
        runtime.step().expect("runtime can advance").last_sequence,
        0
    );
}

#[test]
fn logical_steps_advance_delays_and_do_not_require_a_second_input() {
    let mut runtime = BrowserRuntime::new(11).expect("the fixed browser topology is valid");
    runtime.input(1, &[1.0; 16]).expect("input is accepted");

    runtime
        .step()
        .expect("first logical tick advances the mesh");
    assert_eq!(runtime.mesh_tick(), 1);
    assert!(
        runtime
            .state()
            .topology_delays
            .iter()
            .any(|delay| *delay > 0)
    );
    runtime
        .step()
        .expect("second logical tick advances queued delays without input");
    assert_eq!(runtime.mesh_tick(), 2);
    assert_eq!(runtime.state().completed_step, 2);
}

#[test]
fn runtime_seed_is_provenance_not_topology_and_state_exposes_canonical_edge_lookup() {
    let left = BrowserRuntime::new(1).expect("the fixed browser topology is valid");
    let right = BrowserRuntime::new(99).expect("the fixed browser topology is valid");

    let left = left.state();
    let right = right.state();

    assert_eq!(left.seed, 1);
    assert_eq!(right.seed, 99);
    assert_eq!(left.topology_digest, right.topology_digest);
    assert_eq!(left.topology_node_ids, right.topology_node_ids);
    assert_eq!(left.topology_edge_sources, right.topology_edge_sources);
    assert_eq!(left.topology_edge_targets, right.topology_edge_targets);
    assert_eq!(
        left.topology_edge_weights
            .iter()
            .map(|weight| weight.to_bits())
            .collect::<Vec<_>>(),
        right
            .topology_edge_weights
            .iter()
            .map(|weight| weight.to_bits())
            .collect::<Vec<_>>(),
    );
    assert_eq!(left.topology_edge_delays, right.topology_edge_delays);
    assert_eq!(left.topology_polarities, right.topology_polarities);
    assert_eq!(left.topology_weight_bits, right.topology_weight_bits);
    assert_eq!(
        left.topology_outgoing_edge_offsets,
        right.topology_outgoing_edge_offsets
    );
    assert_eq!(left.topology_node_ids, (0..16).collect::<Vec<_>>());
    assert_eq!(
        left.topology_edge_sources.len(),
        left.topology_targets.len()
    );
    assert_eq!(
        left.topology_edge_sources.len(),
        left.topology_edge_targets.len()
    );
    assert_eq!(
        left.topology_edge_sources.len(),
        left.topology_edge_weights.len()
    );
    assert_eq!(
        left.topology_edge_sources.len(),
        left.topology_edge_delays.len()
    );
    assert_eq!(
        left.topology_edge_sources.len(),
        left.topology_polarities.len()
    );
    assert_eq!(
        left.topology_edge_sources.len(),
        left.topology_weight_bits.len()
    );
    assert_eq!(
        left.topology_outgoing_edge_offsets.len(),
        left.topology_node_ids.len() + 1
    );
    assert_eq!(left.topology_outgoing_edge_offsets.first(), Some(&0));
    assert_eq!(
        left.topology_outgoing_edge_offsets.last(),
        Some(&(left.topology_edge_sources.len() as u32))
    );
    assert!(
        left.topology_outgoing_edge_offsets
            .windows(2)
            .all(|offsets| offsets[0] <= offsets[1])
    );
}

#[test]
fn two_seed9_runtimes_replay_an_identical_trace() {
    fn run(runtime: &mut neuromorphic_adapter::BrowserRuntime) -> Vec<(Vec<u32>, Vec<u32>)> {
        let mut trace = Vec::new();
        runtime.input(1, &[1.0, 0.0, 0.5, 0.25]).unwrap();
        trace.push(runtime.step().unwrap());
        runtime.input(2, &[1.0, 0.9, 0.8, 0.7, 0.6, 0.5]).unwrap();
        for _ in 0..5 {
            trace.push(runtime.step().unwrap());
        }
        trace
            .into_iter()
            .map(|state| {
                (
                    state.spike_neurons,
                    state
                        .membrane_potentials
                        .iter()
                        .map(|potential| potential.to_bits())
                        .collect(),
                )
            })
            .collect()
    }

    let mut left = BrowserRuntime::new(9).unwrap();
    let mut right = BrowserRuntime::new(9).unwrap();
    assert_eq!(run(&mut left), run(&mut right));
}

#[test]
fn a_rebuilt_adapter_replays_the_same_trace_after_dispose() {
    fn run(adapter: &mut neuromorphic_adapter::WasmAdapter) -> Vec<(Vec<u32>, Vec<u32>)> {
        let mut trace = Vec::new();
        adapter.input(1, &[1.0, 0.0, 0.5, 0.25]).unwrap();
        trace.push(adapter.step().unwrap().browser_state().clone());
        adapter.input(2, &[0.9, 0.7, 0.5, 0.3]).unwrap();
        for _ in 0..4 {
            trace.push(adapter.step().unwrap().browser_state().clone());
        }
        trace
            .into_iter()
            .map(|state| {
                (
                    state.spike_neurons,
                    state
                        .membrane_potentials
                        .iter()
                        .map(|potential| potential.to_bits())
                        .collect(),
                )
            })
            .collect()
    }

    let mut adapter =
        neuromorphic_adapter::WasmAdapter::init(9, &[3]).expect("contract version is accepted");
    let first = run(&mut adapter);
    adapter.dispose();
    let mut rebuilt =
        neuromorphic_adapter::WasmAdapter::init(9, &[3]).expect("re-init is accepted");
    assert_eq!(first, run(&mut rebuilt));
}

#[test]
fn contract_6_is_contract_5_with_the_topology_sent_once() {
    let mut five = BrowserRuntime::with_mode(9, EncoderMode::DEFAULT, CONTRACT_VERSION_V5)
        .expect("fixed topology is valid");
    let mut six = BrowserRuntime::with_mode(9, EncoderMode::DEFAULT, CONTRACT_VERSION_V6)
        .expect("fixed topology is valid");
    let topology = six.topology();
    let repeated = five.state();
    assert_eq!(
        topology,
        five.topology(),
        "both contracts export one topology"
    );
    assert_eq!(topology.topology_digest, repeated.topology_digest);
    assert_eq!(topology.topology_rows, repeated.topology_rows);
    assert_eq!(topology.topology_targets, repeated.topology_targets);
    assert_eq!(topology.topology_weights, repeated.topology_weights);
    assert_eq!(topology.topology_delays, repeated.topology_delays);
    assert_eq!(topology.topology_node_ids, repeated.topology_node_ids);
    assert_eq!(
        topology.topology_edge_sources,
        repeated.topology_edge_sources
    );
    assert_eq!(
        topology.topology_edge_targets,
        repeated.topology_edge_targets
    );
    assert_eq!(
        topology.topology_edge_weights,
        repeated.topology_edge_weights
    );
    assert_eq!(topology.topology_edge_delays, repeated.topology_edge_delays);
    assert_eq!(topology.topology_polarities, repeated.topology_polarities);
    assert_eq!(topology.topology_weight_bits, repeated.topology_weight_bits);
    assert_eq!(
        topology.topology_outgoing_edge_offsets,
        repeated.topology_outgoing_edge_offsets
    );
    assert_eq!(topology.topology_edge_sources.len(), 64);

    for step in 1..=24u64 {
        let packet = [
            0.5 + step as f32 * 0.017,
            0.4 - step as f32 * 0.011,
            0.6 + (step % 3) as f32 * 0.1,
        ];
        five.input(step, &packet).expect("input is accepted");
        six.input(step, &packet).expect("input is accepted");
        let a = five.step().expect("contract 5 advances");
        let b = six.step().expect("contract 6 advances");
        assert_eq!(b.contract_version, CONTRACT_VERSION_V6);
        assert_eq!(a.completed_step, b.completed_step);
        assert_eq!(a.last_sequence, b.last_sequence);
        assert_eq!(a.membrane_potentials, b.membrane_potentials);
        assert_eq!(a.spike_neurons, b.spike_neurons);
        assert_eq!(a.encoder_features, b.encoder_features);
        assert_eq!(a.encoded_spike_count, b.encoded_spike_count);
        assert_eq!(a.encoded_spike_total, b.encoded_spike_total);
        assert_eq!(a.error_status, b.error_status);
        assert_eq!(
            b.topology_digest, a.topology_digest,
            "the digest still travels"
        );
        assert!(b.topology_rows.is_empty());
        assert!(b.topology_targets.is_empty());
        assert!(b.topology_weights.is_empty());
        assert!(b.topology_delays.is_empty());
        assert!(b.topology_node_ids.is_empty());
        assert!(b.topology_edge_sources.is_empty());
        assert!(b.topology_edge_targets.is_empty());
        assert!(b.topology_edge_weights.is_empty());
        assert!(b.topology_edge_delays.is_empty());
        assert!(b.topology_polarities.is_empty());
        assert!(b.topology_weight_bits.is_empty());
        assert!(b.topology_outgoing_edge_offsets.is_empty());
        assert_eq!(
            six.topology(),
            topology,
            "the projection never changes between steps"
        );
    }
    assert_eq!(six.topology().topology_edge_weights.len(), 64);
}

#[test]
fn contract_6_accepts_every_encoder_mode_and_only_known_contracts() {
    // Contract 6 accepts every encoder mode, like 4 and 5; the delta-only rule
    // is contract 3's alone, and unknown contract numbers are rejected.
    for mode in [EncoderMode::Delta, EncoderMode::Temporal, EncoderMode::Rate] {
        let runtime =
            BrowserRuntime::with_mode(3, mode, CONTRACT_VERSION_V6).expect("mode accepted");
        let state = runtime.state();
        assert_eq!(state.contract_version, CONTRACT_VERSION_V6);
        assert_eq!(state.encoder_mode, mode as u8);
        // Contract 6 keeps contract 5's feature vector (zeros before any input).
        assert_eq!(state.encoder_features.len(), 16);
        assert!(state.topology_node_ids.is_empty());
    }
    assert!(BrowserRuntime::with_mode(3, EncoderMode::Temporal, 3).is_err());
    assert!(BrowserRuntime::with_mode(3, EncoderMode::Temporal, 9).is_err());
}

#[test]
fn contract_7_runs_the_48_neuron_topology_and_leaves_contracts_3_to_6_on_16() {
    let spec = TopologySpec::V7;
    assert_eq!((spec.neurons, spec.fan_out, spec.synapses()), (48, 6, 288));
    assert_eq!(spec.max_delay, TopologySpec::LEGACY.max_delay);
    for contract in [3, 4, CONTRACT_VERSION_V5, CONTRACT_VERSION_V6] {
        assert_eq!(TopologySpec::for_contract(contract), TopologySpec::LEGACY);
    }
    assert_eq!(TopologySpec::for_contract(CONTRACT_VERSION_V7), spec);

    let mut seven = BrowserRuntime::with_mode(9, EncoderMode::DEFAULT, CONTRACT_VERSION_V7)
        .expect("the contract-7 topology is valid");
    let topology = seven.topology();
    let neurons = spec.neurons as u32;
    assert_eq!(topology.topology_node_ids, (0..neurons).collect::<Vec<_>>());
    assert_eq!(topology.topology_edge_sources.len(), spec.synapses());
    assert_eq!(topology.topology_edge_targets.len(), spec.synapses());
    assert_eq!(topology.topology_rows.len(), spec.neurons + 1);
    assert!(topology.topology_edge_targets.iter().all(|t| *t < neurons));
    assert!(topology.topology_targets.iter().all(|t| *t < neurons));
    // Every neuron keeps exactly `fan_out` outgoing synapses (rewiring moves
    // targets, never sources), so the canonical offsets are a fixed stride.
    assert_eq!(
        topology.topology_outgoing_edge_offsets,
        (0..=spec.neurons)
            .map(|n| (n * spec.fan_out) as u32)
            .collect::<Vec<_>>()
    );
    assert!(
        topology
            .topology_edge_sources
            .iter()
            .enumerate()
            .all(|(edge, source)| *source as usize == edge / spec.fan_out)
    );
    assert!(
        topology
            .topology_edge_delays
            .iter()
            .all(|delay| (1..=spec.max_delay).contains(delay))
    );
    assert_eq!(
        topology
            .topology_polarities
            .iter()
            .filter(|p| **p == 1)
            .count(),
        (spec.synapses() as f32 * spec.inhibitory_fraction) as usize
    );
    assert_ne!(topology.topology_digest, LEGACY_DIGEST);
    assert!(
        topology
            .topology_digest
            .starts_with("synaptic-wiring.topology.digest.v1:sha256:")
    );

    // The seed is provenance, not topology: every contract-7 runtime shares
    // one projection, and contract 6 still ships the legacy one.
    let other = BrowserRuntime::with_mode(99, EncoderMode::Rate, CONTRACT_VERSION_V7)
        .expect("valid")
        .topology();
    assert_eq!(other, topology);
    let six = BrowserRuntime::with_mode(9, EncoderMode::DEFAULT, CONTRACT_VERSION_V6)
        .expect("valid")
        .topology();
    assert_eq!(six.topology_digest, LEGACY_DIGEST);
    assert_eq!(six.topology_edge_sources.len(), 64);

    // Per-step state: 48 potentials, spikes inside the topology, the topology
    // sent once (empty arrays, digest kept) and contract 5's feature vector.
    for step in 1..=24u64 {
        let packet = [
            0.5 + step as f32 * 0.017,
            0.4 - step as f32 * 0.011,
            0.6 + (step % 3) as f32 * 0.1,
        ];
        seven.input(step, &packet).expect("input is accepted");
        let state = seven.step().expect("contract 7 advances");
        assert_eq!(state.contract_version, CONTRACT_VERSION_V7);
        assert_eq!(state.completed_step, step);
        assert_eq!(state.membrane_potentials.len(), spec.neurons);
        assert!(state.spike_neurons.iter().all(|n| *n < neurons));
        assert!(state.spike_neurons.len() < spec.neurons);
        assert_eq!(state.encoder_features.len(), 16);
        assert_eq!(state.topology_digest, topology.topology_digest);
        assert!(state.topology_rows.is_empty());
        assert!(state.topology_node_ids.is_empty());
        assert!(state.topology_edge_sources.is_empty());
        assert!(state.topology_outgoing_edge_offsets.is_empty());
        assert_eq!(seven.topology(), topology, "the projection never changes");
    }
}

#[test]
fn contract_7_init_configs_and_encoder_modes() {
    for (config, mode) in [
        (&[7_u8][..], EncoderMode::DEFAULT),
        (&[7, 0][..], EncoderMode::Delta),
        (&[7, 1][..], EncoderMode::Temporal),
        (&[7, 2][..], EncoderMode::Rate),
    ] {
        let mut adapter = WasmAdapter::init(9, config).expect("contract 7 config is accepted");
        // `WasmTopology`'s getters build `js_sys` arrays, which only exist on
        // wasm32; the native test reads the state through `browser_state`.
        adapter
            .input(1, &[0.5, 0.5, 0.5])
            .expect("telemetry packet");
        let state = adapter.step().expect("step");
        let state = state.browser_state();
        assert_eq!(state.contract_version, CONTRACT_VERSION_V7);
        assert_eq!(state.encoder_mode, mode as u8);
        assert_eq!(state.membrane_potentials.len(), 48);
        assert!(state.topology_edge_sources.is_empty());
        adapter.dispose();
    }
    // Rejections build a `JsValue`, which only exists on wasm32; the native
    // test checks the same rules on `BrowserRuntime` and `EncoderMode`.
    assert!(
        EncoderMode::parse(3).is_err(),
        "reserved modes stay rejected"
    );
    assert!(BrowserRuntime::with_mode(9, EncoderMode::DEFAULT, 9).is_err());
    assert!(
        BrowserRuntime::with_mode(9, EncoderMode::DEFAULT, CONTRACT_VERSION_V7)
            .expect("valid")
            .input(1, &[0.5, 0.5])
            .is_err(),
        "contract 7 input is one [x, y, pressure] packet, like contracts 5 and 6"
    );
}

#[test]
fn contract_8_runs_the_64_neuron_topology_and_leaves_contract_7_on_48() {
    let spec = TopologySpec::V8;
    assert_eq!((spec.neurons, spec.fan_out, spec.synapses()), (64, 8, 512));
    assert_eq!(spec.max_delay, TopologySpec::V7.max_delay);
    assert_eq!(TopologySpec::for_contract(CONTRACT_VERSION_V8), spec);
    assert_eq!(
        TopologySpec::for_contract(CONTRACT_VERSION_V7),
        TopologySpec::V7
    );

    let mut eight = BrowserRuntime::with_mode(9, EncoderMode::DEFAULT, CONTRACT_VERSION_V8)
        .expect("the contract-8 topology is valid");
    let topology = eight.topology();
    let neurons = spec.neurons as u32;
    assert_eq!(topology.topology_node_ids, (0..neurons).collect::<Vec<_>>());
    assert_eq!(topology.topology_edge_sources.len(), spec.synapses());
    assert_eq!(topology.topology_rows.len(), spec.neurons + 1);
    assert!(topology.topology_edge_targets.iter().all(|t| *t < neurons));
    assert_eq!(
        topology.topology_outgoing_edge_offsets,
        (0..=spec.neurons)
            .map(|n| (n * spec.fan_out) as u32)
            .collect::<Vec<_>>()
    );
    assert!(
        topology
            .topology_edge_delays
            .iter()
            .all(|delay| (1..=spec.max_delay).contains(delay))
    );
    assert_eq!(
        topology
            .topology_polarities
            .iter()
            .filter(|p| **p == 1)
            .count(),
        (spec.synapses() as f32 * spec.inhibitory_fraction) as usize
    );
    let seven = BrowserRuntime::with_mode(9, EncoderMode::DEFAULT, CONTRACT_VERSION_V7)
        .expect("valid")
        .topology();
    assert_ne!(topology.topology_digest, seven.topology_digest);
    assert_ne!(topology.topology_digest, LEGACY_DIGEST);
    assert_eq!(seven.topology_edge_sources.len(), 288);
    let other = BrowserRuntime::with_mode(99, EncoderMode::Rate, CONTRACT_VERSION_V8)
        .expect("valid")
        .topology();
    assert_eq!(other, topology, "the seed is provenance, not topology");

    for step in 1..=24u64 {
        let packet = [
            0.5 + step as f32 * 0.017,
            0.4 - step as f32 * 0.011,
            0.6 + (step % 3) as f32 * 0.1,
        ];
        eight.input(step, &packet).expect("input is accepted");
        let state = eight.step().expect("contract 8 advances");
        assert_eq!(state.contract_version, CONTRACT_VERSION_V8);
        assert_eq!(state.membrane_potentials.len(), spec.neurons);
        assert!(state.spike_neurons.iter().all(|n| *n < neurons));
        assert!(state.spike_neurons.len() < spec.neurons);
        assert_eq!(state.encoder_features.len(), 16);
        assert_eq!(state.topology_digest, topology.topology_digest);
        assert!(state.topology_rows.is_empty());
        assert!(state.topology_edge_sources.is_empty());
    }

    for (config, mode) in [
        (&[8_u8][..], EncoderMode::DEFAULT),
        (&[8, 0][..], EncoderMode::Delta),
        (&[8, 1][..], EncoderMode::Temporal),
        (&[8, 2][..], EncoderMode::Rate),
    ] {
        let mut adapter = WasmAdapter::init(9, config).expect("contract 8 config is accepted");
        adapter
            .input(1, &[0.5, 0.5, 0.5])
            .expect("telemetry packet");
        let state = adapter.step().expect("step");
        let state = state.browser_state();
        assert_eq!(state.contract_version, CONTRACT_VERSION_V8);
        assert_eq!(state.encoder_mode, mode as u8);
        assert_eq!(state.membrane_potentials.len(), 64);
        adapter.dispose();
    }
}

#[test]
fn contract_7_fans_each_encoder_channel_into_every_neuron_of_its_residue_class() {
    assert_residue_fan_out(CONTRACT_VERSION_V7, TopologySpec::V7);
}

#[test]
fn contract_8_fans_each_encoder_channel_into_every_neuron_of_its_residue_class() {
    assert_residue_fan_out(CONTRACT_VERSION_V8, TopologySpec::V8);
}

fn assert_residue_fan_out(contract: u32, spec: TopologySpec) {
    // Rebuild the contract's pipeline from the public crate surfaces with an
    // explicit channel-to-neuron mapping, and compare its spikes and
    // potentials with the runtime's, step by step. The residue-class mapping
    // (channel `c` drives every neuron `n` with `n % 16 == c`) reproduces the
    // runtime exactly; a one-to-one mapping onto neurons 0 to 15 does not, so
    // the test fails if `input` ever reverts to it.
    use neuromod::{NeuroModulators, SeedableRng, SpikingNetwork, StdRng};
    use neuromorphic_adapter::encoder::{ENCODER_CHANNELS, V1Encoder};
    use neuromorphic_adapter::kinetic::KineticExtractor;
    use neuromorphic_adapter::lif_bank::LifBankShaping;
    use synaptic_wiring::{SynapticMesh, topology::generate_small_world};

    const SEED: u64 = 9;
    const STEPS: u64 = 120;
    let packet = |sequence: u64| -> [f32; 3] {
        let step = sequence as f32;
        [
            0.5 + 0.4 * (step * 0.21).sin(),
            0.5 + 0.3 * (step * 0.17).cos(),
            if sequence % 10 < 6 { 0.6 } else { 0.0 },
        ]
    };

    let mut runtime =
        BrowserRuntime::with_mode(SEED, EncoderMode::Temporal, contract).expect("valid");
    let actual: Vec<(Vec<u32>, Vec<u32>)> = (1..=STEPS)
        .map(|sequence| {
            runtime.input(sequence, &packet(sequence)).expect("input");
            let state = runtime.step().expect("step");
            (
                state.spike_neurons,
                state
                    .membrane_potentials
                    .iter()
                    .map(|p| p.to_bits())
                    .collect(),
            )
        })
        .collect();

    let pipeline = |map: &dyn Fn(usize, usize) -> bool| -> Vec<(Vec<u32>, Vec<u32>)> {
        let graph = generate_small_world(
            spec.neurons,
            spec.fan_out,
            spec.rewire,
            spec.max_delay,
            spec.inhibitory_fraction,
        )
        .expect("valid");
        let mut mesh = SynapticMesh::new(graph);
        let mut network = SpikingNetwork::with_dimensions(spec.neurons, 0, spec.neurons);
        for neuron in &mut network.neurons {
            neuron.weights = vec![2.0 / spec.neurons as f32; spec.neurons];
        }
        let mut shaping = LifBankShaping::install_with(&mut network, spec.shaping_profile());
        let mut rng = StdRng::seed_from_u64(SEED);
        let mut extractor = KineticExtractor::new();
        let mut encoder = V1Encoder::for_mode(EncoderMode::Temporal);
        (1..=STEPS)
            .map(|sequence| {
                let features = extractor.extract(&packet(sequence));
                let channels = encoder.encode_step(&features);
                let mut sources = vec![false; spec.neurons];
                for channel in &channels {
                    for (neuron, source) in sources.iter_mut().enumerate() {
                        *source |= map(neuron, usize::from(*channel));
                    }
                }
                let currents = mesh.propagate(&sources).expect("propagate");
                let spikes = shaping
                    .step(
                        &mut network,
                        &currents,
                        &NeuroModulators::default(),
                        &mut rng,
                    )
                    .expect("step");
                (
                    spikes.into_iter().map(|n| n as u32).collect(),
                    network
                        .get_membrane_potentials()
                        .iter()
                        .map(|p| p.to_bits())
                        .collect(),
                )
            })
            .collect()
    };

    let residue = pipeline(&|neuron, channel| neuron % ENCODER_CHANNELS == channel);
    let first_sixteen_only = pipeline(&|neuron, channel| neuron == channel);
    assert_eq!(
        actual, residue,
        "the runtime drives neuron n from channel n % 16, bit for bit"
    );
    assert_ne!(
        actual, first_sixteen_only,
        "a mapping onto neurons 0..16 alone would give a different trace"
    );
    assert!(
        actual
            .iter()
            .any(|(spikes, _)| spikes.iter().any(|n| *n >= 16)),
        "neurons above 15 fire in the comparison window"
    );
}
