use super::*;

fn device(provider: &Arc<Provider>, credential: &[u8]) -> Arc<Identity> {
    let key = identity_generate_signature_key(provider.clone()).unwrap();
    identity_bind(provider.clone(), credential.to_vec(), key).unwrap()
}

/// Alice's group with Bob, through the facade's objects only, as Kotlin calls them.
fn alice_with_bob() -> (Arc<Provider>, Arc<Group>, Arc<Provider>, Arc<Group>, AddOutput) {
    let (alice_p, bob_p) = (Provider::new(), Provider::new());
    let (alice, bob) = (device(&alice_p, b"alice"), device(&bob_p, b"bob"));
    let group = group_create_new(alice_p.clone(), alice, b"conv-native".to_vec()).unwrap();
    let add = group.add_member(alice_p.clone(), bob.key_package(bob_p.clone()).unwrap()).unwrap();
    group.merge_pending_commit(alice_p.clone()).unwrap();
    let bob_group = group_join(bob_p.clone(), add.welcome.clone(), None).unwrap();
    (alice_p, group, bob_p, bob_group, add)
}

#[test]
fn a_group_made_through_the_facade_reads_on() {
    let (alice_p, alice, bob_p, bob, _) = alice_with_bob();

    let sent = alice.encrypt_application(alice_p.clone(), b"hello Bob".to_vec()).unwrap();
    let read = bob.process_message(bob_p.clone(), sent).unwrap();

    assert_eq!(read.kind().unwrap(), ProcessedKind::Application);
    assert_eq!(read.application().unwrap(), b"hello Bob");
    assert_eq!(alice.epoch().unwrap(), bob.epoch().unwrap());
    assert_eq!(bob.own_leaf_index().unwrap(), 1);
    let members = bob.list_members().unwrap();
    assert_eq!(members.iter().map(|m| m.leaf_index).collect::<Vec<_>>(), [0, 1]);
}

#[test]
fn a_commit_is_staged_then_applied() {
    let (alice_p, alice, bob_p, bob, _) = alice_with_bob();
    let update = alice.update_credential(alice_p.clone(), b"alice, bound".to_vec()).unwrap();
    alice.merge_pending_commit(alice_p.clone()).unwrap();
    let epoch = bob.epoch().unwrap();

    let staged = bob.process_message(bob_p.clone(), update.commit).unwrap();
    assert_eq!(staged.kind().unwrap(), ProcessedKind::Commit);
    assert_eq!(bob.epoch().unwrap(), epoch);
    bob.apply_commit(bob_p.clone(), staged.clone()).unwrap();

    assert_eq!(bob.epoch().unwrap(), epoch + 1);
    assert_eq!(staged.leaves_met().unwrap().len(), 1);
    assert!(staged.joiner().unwrap().is_none());
}

#[test]
fn a_core_error_keeps_its_kind() {
    let (alice_p, alice, bob_p, bob, _) = alice_with_bob();

    assert!(matches!(key_package_from_bytes(vec![1, 2, 3]), Err(MlsFailure::Malformed(_))));
    assert!(matches!(bob.process_message(bob_p.clone(), vec![1, 2, 3]), Err(MlsFailure::Malformed(_))));
    alice.update(alice_p.clone()).unwrap();
    assert!(matches!(alice.update(alice_p.clone()), Err(MlsFailure::State(_))));
}

#[test]
fn an_external_join_gives_its_group_once() {
    let (_, _, bob_p, bob, add) = alice_with_bob();
    let laptop_p = Provider::new();
    let laptop = device(&laptop_p, b"alice's laptop");

    let join = group_join_by_external_commit(laptop_p.clone(), laptop, b"conv-native".to_vec(), add.group_info).unwrap();
    let staged = bob.process_message(bob_p.clone(), join.commit().unwrap()).unwrap();
    bob.apply_commit(bob_p.clone(), staged).unwrap();
    let group = join.into_group().unwrap();

    assert_eq!(group.epoch().unwrap(), bob.epoch().unwrap());
    assert!(matches!(join.into_group(), Err(MlsFailure::State(_))));
    assert!(group_load_from_provider(laptop_p.clone(), b"conv-native".to_vec()).unwrap().is_some());
    assert!(group_load_from_provider(laptop_p, b"elsewhere".to_vec()).unwrap().is_none());
}

#[test]
fn hpke_seals_what_its_key_pair_opens() {
    let pair = hpke_generate_key_pair().unwrap();

    let sealed = hpke_seal(pair.public_key.clone(), b"info".to_vec(), b"aad".to_vec(), b"the 24 words".to_vec()).unwrap();

    let opened = hpke_open(pair.private_key, sealed.enc, sealed.ciphertext, b"info".to_vec(), b"aad".to_vec()).unwrap();
    assert_eq!(opened, b"the 24 words");
    assert!(matches!(hpke_seal(vec![0; 32], vec![], vec![], vec![1]), Err(MlsFailure::Refused(_))));
}
