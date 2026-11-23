use super::*;
use crate::testing::*;
use crate::{Group, ProcessedKind};

/// Alice's and Bob's providers, one group between them, as the crate wrote them before the split.
const ALICE_BEFORE: &[u8] = include_bytes!("../../fixtures/snapshot-before-split/alice.bin");
const BOB_BEFORE: &[u8] = include_bytes!("../../fixtures/snapshot-before-split/bob.bin");

#[test]
fn a_snapshot_written_before_the_split_reads_back_whole() {
    for before in [ALICE_BEFORE, BOB_BEFORE] {
        let provider = Provider::new();
        provider.deserialize_storage(before).unwrap();

        let again = provider.serialize_storage().unwrap();

        let values = decode_snapshot(before).unwrap();
        assert!(!values.is_empty());
        assert_eq!(decode_snapshot(&again).unwrap(), values);
    }
}

#[test]
fn a_snapshot_reads_back_as_it_was_written() {
    let provider = Provider::new();
    provider.0.storage().values.write().unwrap().extend([
        (b"key".to_vec(), b"value".to_vec()),
        (Vec::new(), vec![7; 300]),
    ]);
    let restored = Provider::new();

    restored.deserialize_storage(&provider.serialize_storage().unwrap()).unwrap();

    assert_eq!(
        *restored.0.storage().values.read().unwrap(),
        *provider.0.storage().values.read().unwrap()
    );
}

#[test]
fn a_cut_snapshot_is_malformed() {
    let provider = Provider::new();
    provider.0.storage().values.write().unwrap().insert(b"key".to_vec(), b"value".to_vec());
    let whole = provider.serialize_storage().unwrap();

    for cut in [0, 4, 8, 20, whole.len() - 1] {
        assert!(
            matches!(Provider::new().deserialize_storage(&whole[..cut]), Err(MlsError::Malformed { .. })),
            "cut at {cut}"
        );
    }
}

/// `Provider::serialize_storage` → `deserialize_storage` round
/// trips through a fresh `Provider`; `Group::load_from_provider`
/// then rebuilds the in-memory group handle and decrypts an
/// inbound application message exactly the same way the original
/// adapter would have. This is the path that survives a page
/// reload.
#[test]
fn provider_storage_round_trip_restores_group() {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let mut alice_p_mut = alice_p;
    let bob_p_immut = bob_p;

    let mut alice_group = Group::create_new(&alice_p_mut, &alice, b"conv-restore").unwrap();
    let bob_kp = bob.key_package(&bob_p_immut).unwrap();
    let add = alice_group.add_member(&alice_p_mut, &bob_kp).unwrap();
    alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();

    let bob_group = Group::join(
        &bob_p_immut,
        welcome_of(&add.welcome),
        Some(tree_of(&alice_group.export_ratchet_tree().unwrap())),
    )
    .unwrap();

    // Snapshot Bob's provider, drop both Bob's group + provider,
    // then restore from the snapshot into a fresh provider and
    // re-load the group via its id.
    let snapshot = bob_p_immut.serialize_storage().unwrap();
    drop(bob_group);
    drop(bob_p_immut);

    let restored_p = Provider::new();
    restored_p.deserialize_storage(&snapshot).unwrap();
    let mut bob_loaded = Group::load_from_provider(&restored_p, b"conv-restore")
        .unwrap()
        .expect("Bob's group should be in the restored provider");

    // Alice sends one more message; restored Bob decrypts it.
    let ct = alice_group
        .encrypt_application(&alice_p_mut, b"after-reload")
        .unwrap();
    let mut restored_p_mut = restored_p;
    let processed = bob_loaded.receive(&mut restored_p_mut, &ct).unwrap();
    assert!(matches!(processed.kind(), ProcessedKind::Application));
    assert_eq!(processed.application(), b"after-reload");
}

/// The groups of a snapshot from before the split load, and their members read each other.
#[test]
fn the_groups_of_a_snapshot_written_before_the_split_still_talk() {
    let (alice_p, bob_p) = (Provider::new(), Provider::new());
    alice_p.deserialize_storage(ALICE_BEFORE).unwrap();
    bob_p.deserialize_storage(BOB_BEFORE).unwrap();
    let mut alice = Group::load_from_provider(&alice_p, b"conv-fixture").unwrap().unwrap();
    let mut bob = Group::load_from_provider(&bob_p, b"conv-fixture").unwrap().unwrap();

    let to_bob = alice.encrypt_application(&alice_p, b"after the split").unwrap();
    assert_eq!(bob.receive(&bob_p, &to_bob).unwrap().application(), b"after the split");
    let to_alice = bob.encrypt_application(&bob_p, b"read you").unwrap();
    assert_eq!(alice.receive(&alice_p, &to_alice).unwrap().application(), b"read you");
}
