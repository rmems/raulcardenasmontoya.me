//! The browser's spike-propagation events (`src/runtime/spike-events.ts`) map
//! a `neuromod` spike at neuron `n` onto the canonical edges
//! `topology_outgoing_edge_offsets[n]..[n + 1]` and time each one by its
//! `topology_edge_delays` entry, read as `synaptic-wiring` delivery ticks
//! (one tick per adapter `step`). These tests pin that reading against the
//! upstream crate itself instead of trusting the projection's own arrays.

use neuromorphic_adapter::{
    BrowserRuntime, BrowserTopology, CONTRACT_VERSION_V5, CONTRACT_VERSION_V7, TopologyProjection,
    TopologySpec, encoder::EncoderMode,
};
use serde_json::Value;
use synaptic_wiring::{SynapticMesh, topology::generate_small_world};

#[test]
fn every_projected_outgoing_range_is_upstream_delivery_of_one_source_spike() {
    // The 16 / 64 topology of contracts 3 to 6 and the 48 / 288 one of
    // contract 7 (RM-2355), each rebuilt from its own parameters.
    for (contract, spec) in [
        (CONTRACT_VERSION_V5, TopologySpec::LEGACY),
        (CONTRACT_VERSION_V7, TopologySpec::V7),
    ] {
        let topology = BrowserRuntime::with_mode(9, EncoderMode::DEFAULT, contract)
            .expect("the browser topology is valid")
            .topology();
        assert_eq!(topology.topology_node_ids.len(), spec.neurons);
        assert_eq!(topology.topology_edge_sources.len(), spec.synapses());
        check_outgoing_ranges(&topology, spec);
    }
}

fn check_outgoing_ranges(state: &BrowserTopology, spec: TopologySpec) {
    // Rebuild the adapter's upstream graph and prove it is the same topology
    // through the upstream digest, so the comparison below is not circular.
    let graph = generate_small_world(
        spec.neurons,
        spec.fan_out,
        spec.rewire,
        spec.max_delay,
        spec.inhibitory_fraction,
    )
    .expect("browser topology");
    assert_eq!(
        TopologyProjection::from_graph(&graph).topology_digest,
        state.topology_digest
    );

    let nodes = state.topology_node_ids.len();
    let max_delay = usize::from(
        *state
            .topology_edge_delays
            .iter()
            .max()
            .expect("the topology has edges"),
    );
    for source in 0..nodes {
        // Upstream: fire `source` once on tick 0, then let every delay land.
        let mut mesh = SynapticMesh::new(graph.clone());
        let mut spikes = vec![false; nodes];
        spikes[source] = true;
        let mut delivered = vec![mesh.propagate(&spikes).expect("tick 0")];
        for tick in 1..=max_delay {
            delivered.push(
                mesh.propagate(&vec![false; nodes])
                    .unwrap_or_else(|error| panic!("tick {tick}: {error}")),
            );
        }

        // Browser mapping: the CSR range, each edge's target and delay.
        let mut expected = vec![vec![0.0_f32; nodes]; max_delay + 1];
        let start = state.topology_outgoing_edge_offsets[source] as usize;
        let end = state.topology_outgoing_edge_offsets[source + 1] as usize;
        assert!(start < end, "neuron {source} has outgoing synapses");
        for edge in start..end {
            assert_eq!(state.topology_edge_sources[edge] as usize, source);
            let delay = usize::from(state.topology_edge_delays[edge]);
            let target = state.topology_edge_targets[edge] as usize;
            expected[delay][target] += state.topology_edge_weights[edge];
        }

        assert_eq!(
            delivered, expected,
            "a spike at neuron {source} arrives where and when its edge range says"
        );
    }
}

#[test]
fn neuromod_spikes_index_the_topology_neuron_id_domain() {
    // Replay the inputs of the committed contract-5 golden trace, which
    // drives real `neuromod` spikes.
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/kinetic-seed9-trace.json")).expect("fixture");
    let seed = fixture["seed"]
        .as_str()
        .and_then(|value| value.parse().ok())
        .expect("decimal seed");
    let mut runtime = BrowserRuntime::with_mode(seed, EncoderMode::DEFAULT, CONTRACT_VERSION_V5)
        .expect("the fixed browser topology is valid");
    let mut spiking_steps = 0;
    for operation in fixture["operations"].as_array().expect("operations") {
        if operation["op"] == "input" {
            let sequence = operation["sequence"]
                .as_str()
                .and_then(|value| value.parse().ok())
                .expect("decimal sequence");
            let samples: Vec<f32> = operation["samples"]
                .as_array()
                .expect("samples")
                .iter()
                .map(|sample| sample.as_f64().expect("number") as f32)
                .collect();
            runtime.input(sequence, &samples).expect("telemetry packet");
            continue;
        }
        let state = runtime.step().expect("step");
        assert_eq!(
            state.membrane_potentials.len(),
            state.topology_node_ids.len(),
            "the LIF bank is sized to the topology"
        );
        assert!(
            state
                .topology_node_ids
                .iter()
                .enumerate()
                .all(|(index, id)| *id as usize == index),
            "node ids are the dense NeuronId domain the CSR offsets are keyed by"
        );
        assert!(
            state
                .spike_neurons
                .iter()
                .all(|neuron| (*neuron as usize) < state.topology_node_ids.len()),
            "every spike names a topology neuron"
        );
        if !state.spike_neurons.is_empty() {
            spiking_steps += 1;
        }
    }
    assert!(
        spiking_steps > 0,
        "the golden inputs drive real neuromod spikes"
    );
}
