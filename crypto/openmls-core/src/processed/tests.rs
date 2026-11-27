use super::*;
use crate::testing::*;
use crate::{Identity, Provider};

/// Bob meets the leaf Alice's commit brings in; neither his own nor Alice's, unchanged, is news.
#[test]
fn a_commit_adding_a_leaf_reports_it_as_met() {
    let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-011");
    let charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles@idp.bob.com");
    let add = alice_group
        .add_member(&alice_p, &charles.key_package(&charles_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();

    let processed = bob_group.receive(&mut bob_p, &add.commit).unwrap();

    let met = processed.leaves_met();
    assert_eq!(met.len(), 1);
    assert_eq!(met[0].credential_bytes(), b"charles@idp.bob.com");
    assert_eq!(met[0].signature_public_key(), charles.signature_public_key());
    assert_eq!(bob_group.own_leaf_index(), 1);
    assert_eq!(alice_group.own_leaf_index(), 0);
}

#[test]
fn a_commit_removing_a_leaf_meets_none() {
    let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-012");
    let charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles@idp.bob.com");
    let add = alice_group
        .add_member(&alice_p, &charles.key_package(&charles_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    bob_group.receive(&mut bob_p, &add.commit).unwrap();
    let remove = alice_group.remove_member(&alice_p, 2).unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();

    let processed = bob_group.receive(&mut bob_p, &remove.commit).unwrap();

    assert!(processed.leaves_met().is_empty());
    assert_eq!(bob_group.list_members().len(), 2);
}

/// A member's proposal and a join proposal from outside are taken and dropped.
#[test]
fn a_proposal_received_is_never_kept() {
    let (mut alice_p, mut alice_group, bob_p, mut bob_group) = alice_with_bob(b"conv-014");

    for proposal in [
        bobs_update_proposal(&bob_p, &mut bob_group),
        join_proposal(&alice_group, b"mallory"),
    ] {
        let processed = alice_group.receive(&mut alice_p, &proposal).unwrap();

        assert!(matches!(processed.kind(), ProcessedKind::Proposal));
        assert!(!alice_group.mls_group.has_pending_proposals());
    }
}

/// Bob sees, before applying it, that the laptop's commit is a device committing itself in, which
/// leaf it brings and where; applied, it sits there.
#[test]
fn an_external_commit_shows_its_joiner_where_it_sits() {
    let (_, _, mut bob_p, mut bob_group) = alice_with_bob(b"conv-030");
    let update = bob_group.update(&bob_p).unwrap();
    bob_group.merge_pending_commit(&mut bob_p).unwrap();
    let laptop_p = Provider::new();
    let laptop = identity(&laptop_p, b"alice's laptop");
    let join = Group::join_by_external_commit(&laptop_p, &laptop, b"conv-030", group_info_of(&update.group_info)).unwrap();
    let commit = join.commit();
    let laptop_group = join.into_group();
    let epoch = bob_group.epoch();

    let mut processed = bob_group.process_message(&mut bob_p, message_of(&commit)).unwrap();

    let joiner = processed.joiner().unwrap();
    assert_eq!(joiner.credential_bytes(), b"alice's laptop");
    assert_eq!(joiner.signature_public_key(), laptop.signature_public_key());
    assert_eq!(joiner.leaf_index(), laptop_group.own_leaf_index());
    assert!(processed.removed().is_empty());
    assert_eq!(bob_group.epoch(), epoch);

    bob_group.apply_commit(&mut bob_p, &mut processed).unwrap();
    assert_eq!(bob_group.epoch(), epoch + 1);
    assert_eq!(processed.joiner().unwrap().leaf_index(), laptop_group.own_leaf_index());
    assert_eq!(processed.leaves_met(), vec![joiner]);
}

#[test]
fn a_members_commit_has_no_joiner() {
    let (alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-031");
    let charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles");
    let add = alice_group.add_member(&alice_p, &charles.key_package(&charles_p).unwrap()).unwrap();

    let processed = bob_group.process_message(&mut bob_p, message_of(&add.commit)).unwrap();

    assert!(processed.joiner().is_none());
    assert!(processed.removed().is_empty());
}

/// Mallory commits herself in over the key of Charles's leaf, which openmls then removes: Bob
/// sees the leaf it would remove, as it stands, and dropping the commit unapplied changes nothing.
#[test]
fn an_external_commit_shows_the_leaves_it_removes_and_dropped_changes_nothing() {
    let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-032");
    let charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles");
    let add = alice_group.add_member(&alice_p, &charles.key_package(&charles_p).unwrap()).unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    bob_group.receive(&mut bob_p, &add.commit).unwrap();
    let charles_leaf = bob_group.list_members().into_iter().find(|m| m.credential_bytes() == b"charles").unwrap();
    let mallory = Identity::bind(&charles_p, b"mallory", charles.signature_public_key()).unwrap();
    let join = Group::join_by_external_commit(&charles_p, &mallory, b"conv-032", group_info_of(&add.group_info)).unwrap();
    let (members, epoch) = (bob_group.list_members(), bob_group.epoch());

    let processed = bob_group.process_message(&mut bob_p, message_of(&join.commit())).unwrap();

    assert_eq!(processed.removed(), vec![charles_leaf.clone()]);
    let joiner = processed.joiner().unwrap();
    assert_eq!(joiner.credential_bytes(), b"mallory");
    assert_eq!(joiner.leaf_index(), charles_leaf.leaf_index());
    drop(processed);
    assert_eq!((bob_group.list_members(), bob_group.epoch()), (members, epoch));
    let hello = alice_group.encrypt_application(&alice_p, b"still here").unwrap();
    assert_eq!(bob_group.receive(&mut bob_p, &hello).unwrap().application(), b"still here");
}
