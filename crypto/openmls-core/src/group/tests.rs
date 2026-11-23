use openmls::framing::{MlsMessageBodyIn, MlsMessageIn, ProcessedMessageContent};
use openmls::group::MlsGroupJoinConfig;
use openmls::key_packages::Lifetime;
use tls_codec::Deserialize;

use super::*;
use crate::config::KEY_PACKAGE_LIFETIME_SECONDS;
use crate::testing::*;
use crate::ProcessedKind;

/// A device puts a new credential in its own leaf over the same key; its peers meet it and go
/// on reading what it signs with that key.
#[test]
fn a_leaf_takes_a_new_credential_over_its_signature_key() {
    let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-013");
    let key = alice_group.list_members()[0].signature_public_key();

    let update = alice_group.update_credential(&alice_p, b"alice, bound").unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let processed = bob_group.receive(&mut bob_p, &update.commit).unwrap();

    let met = processed.leaves_met();
    assert_eq!(met.len(), 1);
    assert_eq!(met[0].leaf_index(), 0);
    assert_eq!(met[0].credential_bytes(), b"alice, bound");
    assert_eq!(met[0].signature_public_key(), key);
    assert_eq!(alice_group.list_members()[0].credential_bytes(), b"alice, bound");
    let ciphertext = alice_group.encrypt_application(&alice_p, b"still me").unwrap();
    let read = bob_group.receive(&mut bob_p, &ciphertext).unwrap();
    assert_eq!(read.application(), b"still me");
}

/// One of the four commits a device makes, answering one of its outputs.
type MakeCommit<'a> = &'a dyn Fn(&mut Group, &Provider) -> Vec<u8>;

/// What the wrapper did with a proposal before: kept it, for the group's next commit to carry.
fn store_as_before(group: &mut Group, provider: &Provider, proposal: &[u8]) {
    let processed = match MlsMessageIn::tls_deserialize(&mut &proposal[..]).unwrap().extract() {
        MlsMessageBodyIn::PrivateMessage(m) => group.mls_group.process_message(&provider.0, m),
        MlsMessageBodyIn::PublicMessage(m) => group.mls_group.process_message(&provider.0, m),
        other => panic!("not a proposal: {other:?}"),
    }
    .unwrap();
    match processed.into_content() {
        ProcessedMessageContent::ProposalMessage(p)
        | ProcessedMessageContent::ExternalJoinProposalMessage(p) => group
            .mls_group
            .store_pending_proposal(provider.0.storage(), *p)
            .unwrap(),
        _ => panic!("not a proposal"),
    }
}

/// Whatever the group holds — proposals kept before they were ignored —, a commit carries only
/// what this device proposed: no leaf Bob or Mallory proposed comes in by Alice's add, removal,
/// update or new credential.
#[test]
fn a_commit_carries_no_proposal_it_did_not_make() {
    let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-017");
    let charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles").key_package(&charles_p).unwrap();
    let commits: [MakeCommit; 4] = [
        &|group, provider| group.add_member(provider, &charles).unwrap().commit,
        &|group, provider| group.remove_member(provider, 2).unwrap().commit,
        &|group, provider| group.update(provider).unwrap().commit,
        &|group, provider| group.update_credential(provider, b"alice, again").unwrap().commit,
    ];

    for commit in commits {
        let mallory = join_proposal(&alice_group, b"mallory");
        store_as_before(&mut alice_group, &alice_p, &mallory);
        store_as_before(&mut bob_group, &bob_p, &mallory);
        let update = bobs_update_proposal(&bob_p, &mut bob_group);
        store_as_before(&mut alice_group, &alice_p, &update);
        assert!(alice_group.mls_group.has_pending_proposals());

        let commit = commit(&mut alice_group, &alice_p);
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        bob_group.receive(&mut bob_p, &commit).unwrap();

        for group in [&alice_group, &bob_group] {
            let credentials: Vec<_> = group.list_members().iter().map(|m| m.credential_bytes()).collect();
            assert!(!credentials.contains(&b"mallory".to_vec()));
            assert!(credentials.contains(&b"bob@idp.bob.com".to_vec()));
            assert!(!credentials.contains(&b"bob, proposed".to_vec()));
        }
        assert!(!alice_group.mls_group.has_pending_proposals());
    }
}

/// The epoch a GroupInfo is of, once it is shown to carry what a device joins by alone: the
/// ratchet tree and the `external_pub` key.
fn joinable_epoch(group_info: &[u8], group_id: &[u8]) -> u64 {
    let info = group_info_of(group_info).0;
    assert_eq!(info.group_id().as_slice(), group_id);
    assert!(info.extensions().ratchet_tree().is_some());
    assert!(info.extensions().external_pub().is_some());
    info.epoch().as_u64()
}

#[test]
fn every_commit_comes_with_the_group_info_of_the_epoch_it_opens() {
    let (mut alice_p, mut alice_group, _, _) = alice_with_bob(b"conv-018");
    let charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles").key_package(&charles_p).unwrap();
    let commits: [MakeCommit; 4] = [
        &|group, provider| group.add_member(provider, &charles).unwrap().group_info,
        &|group, provider| group.remove_member(provider, 2).unwrap().group_info,
        &|group, provider| group.update(provider).unwrap().group_info,
        &|group, provider| group.update_credential(provider, b"alice, again").unwrap().group_info,
    ];

    for commit in commits {
        let group_info = commit(&mut alice_group, &alice_p);
        alice_group.merge_pending_commit(&mut alice_p).unwrap();

        assert_eq!(joinable_epoch(&group_info, b"conv-018"), alice_group.epoch());
    }
}

/// Alice's new laptop, holding no group, joins from the GroupInfo Bob's last commit came with;
/// Bob meets its leaf as he applies the commit, as he meets an added one, and they read each
/// other. Charles joins in turn from the GroupInfo the laptop's commit came with.
#[test]
fn a_device_joins_by_external_commit_from_a_commits_group_info() {
    let (_, _, mut bob_p, mut bob_group) = alice_with_bob(b"conv-016");
    let update = bob_group.update(&bob_p).unwrap();
    bob_group.merge_pending_commit(&mut bob_p).unwrap();
    let mut laptop_p = Provider::new();
    let laptop = identity(&laptop_p, b"alice's laptop");

    let join = Group::join_by_external_commit(&laptop_p, &laptop, b"conv-016", group_info_of(&update.group_info)).unwrap();
    let (commit, group_info) = (join.commit(), join.group_info());
    assert_eq!(join.epoch(), bob_group.epoch() + 1);
    let mut laptop_group = join.into_group();
    let processed = bob_group.receive(&mut bob_p, &commit).unwrap();

    assert!(matches!(processed.kind(), ProcessedKind::Commit));
    let met = processed.leaves_met();
    assert_eq!(met.len(), 1);
    assert_eq!(met[0].credential_bytes(), b"alice's laptop");
    assert_eq!(met[0].signature_public_key(), laptop.signature_public_key());
    assert_eq!(met[0].leaf_index(), laptop_group.own_leaf_index());
    assert_eq!(bob_group.epoch(), laptop_group.epoch());
    let to_bob = laptop_group.encrypt_application(&laptop_p, b"back").unwrap();
    assert_eq!(bob_group.receive(&mut bob_p, &to_bob).unwrap().application(), b"back");
    let to_laptop = bob_group.encrypt_application(&bob_p, b"welcome back").unwrap();
    assert_eq!(
        laptop_group.receive(&mut laptop_p, &to_laptop).unwrap().application(),
        b"welcome back"
    );
    assert_eq!(joinable_epoch(&group_info, b"conv-016"), laptop_group.epoch());

    let mut charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles");
    let join = Group::join_by_external_commit(&charles_p, &charles, b"conv-016", group_info_of(&group_info)).unwrap();
    let commit = join.commit();
    let mut charles_group = join.into_group();
    bob_group.receive(&mut bob_p, &commit).unwrap();
    laptop_group.receive(&mut laptop_p, &commit).unwrap();
    let hello = bob_group.encrypt_application(&bob_p, b"hello both").unwrap();
    for (group, provider) in [(&mut laptop_group, &mut laptop_p), (&mut charles_group, &mut charles_p)] {
        assert_eq!(group.receive(provider, &hello).unwrap().application(), b"hello both");
    }
}

/// A join's group is stored as it is made; one the DS refused is deleted, and a join after
/// it finds nothing in its way.
#[test]
fn a_refused_join_leaves_nothing_behind() {
    let (_, _, mut bob_p, mut bob_group) = alice_with_bob(b"conv-019");
    let update = bob_group.update(&bob_p).unwrap();
    bob_group.merge_pending_commit(&mut bob_p).unwrap();
    let laptop_p = Provider::new();
    let laptop = identity(&laptop_p, b"alice's laptop");

    let mut refused = Group::join_by_external_commit(&laptop_p, &laptop, b"conv-019", group_info_of(&update.group_info))
        .unwrap()
        .into_group();
    assert!(Group::load_from_provider(&laptop_p, b"conv-019").unwrap().is_some());
    refused.delete(&laptop_p).unwrap();
    assert!(Group::load_from_provider(&laptop_p, b"conv-019").unwrap().is_none());

    Group::join_by_external_commit(&laptop_p, &laptop, b"conv-019", group_info_of(&update.group_info)).unwrap();
    let again = Group::join_by_external_commit(&laptop_p, &laptop, b"conv-019", group_info_of(&update.group_info)).unwrap();
    let commit = again.commit();
    bob_group.receive(&mut bob_p, &commit).unwrap();
    assert_eq!(bob_group.list_members().len(), 3);
}

/// A commit the DS never acknowledged blocks the group's next commit; clearing it frees it.
#[test]
fn a_cleared_pending_commit_lets_the_group_commit_again() {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let (mut alice_p, mut bob_p) = (alice_p, bob_p);
    let mut alice_group = Group::create_new(&alice_p, &alice, b"conv-002").unwrap();
    let add = alice_group
        .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let tree = alice_group.export_ratchet_tree().unwrap();
    let mut bob_group = Group::join(&bob_p, welcome_of(&add.welcome), Some(tree_of(&tree))).unwrap();

    alice_group.remove_member(&alice_p, 1).unwrap();
    assert!(alice_group.mls_group.pending_commit().is_some());

    alice_group.clear_pending_commit(&mut alice_p).unwrap();
    assert!(alice_group.mls_group.pending_commit().is_none());
    let update = alice_group.update(&alice_p).unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    bob_group.receive(&mut bob_p, &update.commit).unwrap();
    let ciphertext = alice_group
        .encrypt_application(&alice_p, b"still in step")
        .unwrap();
    let processed = bob_group.receive(&mut bob_p, &ciphertext).unwrap();
    assert_eq!(processed.application(), b"still in step");
}

/// Alice's group with Bob, whose leaf — never updated — outlived the KeyPackage it came in by.
fn bob_past_his_leafs_lifetime(group_id: &[u8]) -> (Provider, Group, Provider, Group) {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let mut alice_p = alice_p;
    let mut alice_group = Group::create_new(&alice_p, &alice, group_id).unwrap();
    let add = alice_group
        .add_member(&alice_p, &short_lived_key_package(&bob_p, &bob, 1))
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let bob_group = Group::join(&bob_p, welcome_of(&add.welcome), None).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(2_100));
    (alice_p, alice_group, bob_p, bob_group)
}

/// Charles comes in by Welcome, Dave by external commit, and Charles again by Welcome once
/// removed — all over Bob's leaf, past its lifetime, which openmls's default refuses.
#[test]
fn a_leaf_past_its_lifetime_keeps_no_device_out() {
    let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = bob_past_his_leafs_lifetime(b"conv-030");
    let mut charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles");

    let add = alice_group
        .add_member(&alice_p, &charles.key_package(&charles_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    bob_group.receive(&mut bob_p, &add.commit).unwrap();
    let mut charles_group = Group::join(&charles_p, welcome_of(&add.welcome), None).unwrap();

    let refused = MlsGroup::external_commit_builder()
        .with_config(join_config())
        .build_group(&charles_p.0, group_info_of(&add.group_info).0, charles.credential_with_key.clone());
    assert!(refused.is_err(), "openmls's default checks the leaves' lifetimes");
    let mut dave_p = Provider::new();
    let dave = identity(&dave_p, b"dave");
    let join = Group::join_by_external_commit(&dave_p, &dave, b"conv-030", group_info_of(&add.group_info)).unwrap();
    let commit = join.commit();
    let mut dave_group = join.into_group();
    for (group, provider) in [
        (&mut alice_group, &mut alice_p),
        (&mut bob_group, &mut bob_p),
        (&mut charles_group, &mut charles_p),
    ] {
        group.receive(provider, &commit).unwrap();
    }
    let hello = bob_group.encrypt_application(&bob_p, b"still here").unwrap();
    for (group, provider) in [(&mut charles_group, &mut charles_p), (&mut dave_group, &mut dave_p)] {
        assert_eq!(group.receive(provider, &hello).unwrap().application(), b"still here");
    }

    let remove = alice_group.remove_member(&alice_p, charles_group.own_leaf_index()).unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    charles_group.receive(&mut charles_p, &remove.commit).unwrap();
    let back = alice_group
        .add_member(&alice_p, &charles.key_package(&charles_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let mut charles_group = charles_group.rejoin(&charles_p, welcome_of(&back.welcome)).unwrap().unwrap();
    let again = alice_group.encrypt_application(&alice_p, b"welcome back").unwrap();
    assert_eq!(charles_group.receive(&mut charles_p, &again).unwrap().application(), b"welcome back");
}

const WEEK: u64 = 7 * 24 * 60 * 60;

/// A KeyPackage of `identity`'s made `ago` seconds back and living `seconds` from then — the
/// clock moved on by `ago` since it was made, as far as its lifetime tells.
fn key_package_made_ago(provider: &Provider, identity: &Identity, ago: u64, seconds: u64) -> KeyPackage {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let made = now - ago;
    identity
        .key_package_living(provider, Lifetime::init(made - 60 * 60, made + seconds))
        .unwrap()
}

/// Charles's KeyPackage was made 13 weeks ago: Bob, away since, still applies the add that used
/// it, and reads Charles. Under openmls's default of 12 weeks, the check an add goes through —
/// Bob's as he applies it, Alice's as she makes it — refuses it by then.
#[test]
fn a_member_applies_an_add_thirteen_weeks_after_the_key_package_was_made() {
    let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-032");
    let charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles");
    let made = key_package_made_ago(&charles_p, &charles, 13 * WEEK, KEY_PACKAGE_LIFETIME_SECONDS);
    let add = alice_group.add_member(&alice_p, &made).unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();

    bob_group.receive(&mut bob_p, &add.commit).unwrap();
    let mut charles_group = Group::join(&charles_p, welcome_of(&add.welcome), None).unwrap();
    let hello = charles_group.encrypt_application(&charles_p, b"hello Bob").unwrap();
    assert_eq!(bob_group.receive(&mut bob_p, &hello).unwrap().application(), b"hello Bob");

    let twelve_weeks = key_package_made_ago(&charles_p, &charles, 13 * WEEK, 12 * WEEK);
    let signer = alice_group.signer(&alice_p).unwrap();
    let refused = alice_group
        .mls_group
        .commit_builder()
        .propose_adds([twelve_weeks.0])
        .load_psks(alice_p.0.storage())
        .unwrap()
        .build(alice_p.0.rand(), alice_p.0.crypto(), &signer, |_| true);
    assert!(refused.is_err(), "openmls checks an added KeyPackage's lifetime");
}

/// A join by external commit the provider still holds, neither kept nor deleted — a reload came
/// while it was pending — doesn't stand in the way of a Welcome.
#[test]
fn a_welcome_joins_over_a_join_never_kept() {
    let (mut alice_p, mut alice_group, _, _) = alice_with_bob(b"conv-031");
    let update = alice_group.update(&alice_p).unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let mut laptop_p = Provider::new();
    let laptop = identity(&laptop_p, b"alice's laptop");
    drop(Group::join_by_external_commit(&laptop_p, &laptop, b"conv-031", group_info_of(&update.group_info)).unwrap());
    assert!(Group::load_from_provider(&laptop_p, b"conv-031").unwrap().is_some());

    let add = alice_group
        .add_member(&alice_p, &laptop.key_package(&laptop_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let mut laptop_group = Group::join(&laptop_p, welcome_of(&add.welcome), None).unwrap();

    let hello = alice_group.encrypt_application(&alice_p, b"in").unwrap();
    assert_eq!(laptop_group.receive(&mut laptop_p, &hello).unwrap().application(), b"in");
}

/// Bob joined Alice's group; Charles, whom Bob adds, joins from Bob's Welcome alone, as a
/// user's second device does when its first adds it.
#[test]
fn a_welcome_from_a_member_who_joined_carries_the_ratchet_tree() {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let (mut alice_p, mut bob_p) = (alice_p, bob_p);
    let mut charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles@idp.bob.com");
    let mut alice_group = Group::create_new(&alice_p, &alice, b"conv-006").unwrap();
    let add_bob = alice_group
        .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let mut bob_group = Group::join(&bob_p, welcome_of(&add_bob.welcome), None).unwrap();

    let add_charles = bob_group
        .add_member(&bob_p, &charles.key_package(&charles_p).unwrap())
        .unwrap();
    bob_group.merge_pending_commit(&mut bob_p).unwrap();
    let mut charles_group = Group::join(&charles_p, welcome_of(&add_charles.welcome), None).unwrap();

    let ciphertext = bob_group.encrypt_application(&bob_p, b"in").unwrap();
    let processed = charles_group
        .receive(&mut charles_p, &ciphertext)
        .unwrap();
    assert_eq!(processed.application(), b"in");
}

/// A group joined while Welcomes went without the tree takes it on load, so the next one it
/// sends carries it.
#[test]
fn a_group_joined_without_the_ratchet_tree_extension_takes_it_on_load() {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let (mut alice_p, mut bob_p) = (alice_p, bob_p);
    let charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles@idp.bob.com");
    let mut alice_group = Group::create_new(&alice_p, &alice, b"conv-007").unwrap();
    let add_bob = alice_group
        .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let before = MlsGroupJoinConfig::builder().build();
    StagedWelcome::new_from_welcome(&bob_p.0, &before, welcome_of(&add_bob.welcome).0, None)
        .unwrap()
        .into_group(&bob_p.0)
        .unwrap();

    let mut bob_group = Group::load_from_provider(&bob_p, b"conv-007").unwrap().unwrap();

    assert_eq!(bob_group.mls_group.configuration(), &join_config());
    let add_charles = bob_group
        .add_member(&bob_p, &charles.key_package(&charles_p).unwrap())
        .unwrap();
    bob_group.merge_pending_commit(&mut bob_p).unwrap();
    Group::join(&charles_p, welcome_of(&add_charles.welcome), None).unwrap();
}

/// A message and a commit travel separately: one sent just before a commit can arrive after
/// it, at a member who joined from a Welcome.
#[test]
fn a_message_overtaken_by_a_commit_is_read_by_a_member_who_joined() {
    let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-008");
    let sent = alice_group
        .encrypt_application(&alice_p, b"before the commit")
        .unwrap();
    let update = alice_group.update(&alice_p).unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();

    bob_group
        .receive(&mut bob_p, &update.commit)
        .unwrap();
    let processed = bob_group.receive(&mut bob_p, &sent).unwrap();

    assert_eq!(processed.application(), b"before the commit");
}

/// The same at the group's founder, whose group was built rather than joined.
#[test]
fn a_message_overtaken_by_a_commit_is_read_by_the_founder() {
    let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-009");
    let sent = bob_group
        .encrypt_application(&bob_p, b"before the commit")
        .unwrap();
    let update = bob_group.update(&bob_p).unwrap();
    bob_group.merge_pending_commit(&mut bob_p).unwrap();

    alice_group
        .receive(&mut alice_p, &update.commit)
        .unwrap();
    let processed = alice_group.receive(&mut alice_p, &sent).unwrap();

    assert_eq!(processed.application(), b"before the commit");
}

/// The window's edge: five commits behind is still read, six is refused.
#[test]
fn a_message_five_commits_behind_is_still_read() {
    let (mut alice_p, mut alice_group, mut bob_p, mut bob_group) = alice_with_bob(b"conv-010");
    let sent = alice_group
        .encrypt_application(&alice_p, b"five behind")
        .unwrap();

    for _ in 0..5 {
        let update = alice_group.update(&alice_p).unwrap();
        alice_group.merge_pending_commit(&mut alice_p).unwrap();
        bob_group
            .receive(&mut bob_p, &update.commit)
            .unwrap();
    }
    let processed = bob_group.receive(&mut bob_p, &sent).unwrap();

    assert_eq!(processed.application(), b"five behind");
}

/// Past the window: six commits behind, the message's keys are gone.
#[test]
fn a_message_six_commits_behind_is_refused() {
    let (alice_p, mut alice_group, bob_p, mut bob_group) = alice_with_bob(b"conv-040");
    let sent = alice_group.encrypt_application(&alice_p, b"six behind").unwrap();

    for _ in 0..6 {
        let update = alice_group.update(&alice_p).unwrap();
        alice_group.merge_pending_commit(&alice_p).unwrap();
        bob_group.receive(&bob_p, &update.commit).unwrap();
    }

    assert!(matches!(bob_group.receive(&bob_p, &sent), Err(MlsError::Refused { .. })));
}

/// Bob, committed out of the group and added back, takes the Welcome over the group he held.
#[test]
fn a_welcome_from_a_later_epoch_replaces_the_group_held() {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let (mut alice_p, mut bob_p) = (alice_p, bob_p);
    let mut alice_group = Group::create_new(&alice_p, &alice, b"conv-003").unwrap();
    let first = alice_group
        .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let mut held = Group::join(&bob_p, welcome_of(&first.welcome), None).unwrap();
    alice_group.remove_member(&alice_p, 1).unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let again = alice_group
        .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();

    let mut rejoined = held.rejoin(&bob_p, welcome_of(&again.welcome)).unwrap().unwrap();

    assert_eq!(rejoined.epoch(), alice_group.epoch());
    let ciphertext = alice_group
        .encrypt_application(&alice_p, b"welcome back")
        .unwrap();
    let processed = rejoined.receive(&mut bob_p, &ciphertext).unwrap();
    assert_eq!(processed.application(), b"welcome back");
    let stored = Group::load_from_provider(&bob_p, b"conv-003").unwrap().unwrap();
    assert_eq!(stored.epoch(), rejoined.epoch());
}

/// Both founded the group at once: Alice's Welcome is no later than Bob's own group, so Bob
/// keeps his.
#[test]
fn a_welcome_no_later_than_the_group_held_keeps_it() {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let (mut alice_p, mut bob_p) = (alice_p, bob_p);
    let mut alice_group = Group::create_new(&alice_p, &alice, b"conv-004").unwrap();
    let add = alice_group
        .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p).unwrap();
    let mut bobs_own = Group::create_new(&bob_p, &bob, b"conv-004").unwrap();
    bobs_own.update(&bob_p).unwrap();
    bobs_own.merge_pending_commit(&mut bob_p).unwrap();

    assert!(bobs_own.rejoin(&bob_p, welcome_of(&add.welcome)).unwrap().is_none());

    let stored = Group::load_from_provider(&bob_p, b"conv-004").unwrap().unwrap();
    assert_eq!(stored.list_members().len(), 1);
    assert_eq!(stored.epoch(), 1);
}

#[test]
fn a_deleted_group_is_gone_from_the_provider() {
    let (alice_p, alice, _, _) = make_alice_and_bob();
    let mut group = Group::create_new(&alice_p, &alice, b"conv-005").unwrap();

    group.delete(&alice_p).unwrap();

    assert!(Group::load_from_provider(&alice_p, b"conv-005").unwrap().is_none());
}

/// Two-member group: create, add, exchange one app message, decrypt
/// matches.
#[test]
fn two_member_round_trip() {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let mut alice_p_mut = alice_p;
    let mut bob_p_mut = bob_p;

    let bob_kp = bob.key_package(&bob_p_mut).unwrap();
    let bob_kp_bytes = bob_kp.to_bytes().unwrap();
    // Round-trip the KeyPackage to prove the wire format works.
    let bob_kp_validated = KeyPackage::parse(&bob_kp_bytes).unwrap();

    let mut alice_group =
        Group::create_new(&alice_p_mut, &alice, b"conv-001").unwrap();

    let add = alice_group
        .add_member(&alice_p_mut, &bob_kp_validated)
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();

    let tree = alice_group.export_ratchet_tree().unwrap();
    let mut bob_group = Group::join(&bob_p_mut, welcome_of(&add.welcome), Some(tree_of(&tree))).unwrap();

    // Alice encrypts; Bob decrypts.
    let plaintext = b"hello bob, encrypted";
    let ciphertext = alice_group
        .encrypt_application(&alice_p_mut, plaintext)
        .unwrap();
    let processed = bob_group.receive(&mut bob_p_mut, &ciphertext).unwrap();
    assert!(matches!(processed.kind(), ProcessedKind::Application));
    assert_eq!(processed.application(), plaintext);
}

/// Three-member group: alice adds bob, then alice adds charles. Bob
/// processes alice's add-charles commit; all three can decrypt the
/// same message.
#[test]
fn three_member_fanout() {
    let alice_p = Provider::new();
    let alice = identity(&alice_p, b"alice");
    let bob_p = Provider::new();
    let bob = identity(&bob_p, b"bob");
    let charles_p = Provider::new();
    let charles = identity(&charles_p, b"charles");

    let mut alice_p_mut = alice_p;
    let mut bob_p_mut = bob_p;
    let mut charles_p_mut = charles_p;

    let mut alice_group = Group::create_new(&alice_p_mut, &alice, b"conv").unwrap();

    // Add Bob.
    let bob_kp = bob.key_package(&bob_p_mut).unwrap();
    let add_bob = alice_group.add_member(&alice_p_mut, &bob_kp).unwrap();
    alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();
    let mut bob_group = Group::join(
        &bob_p_mut,
        welcome_of(&add_bob.welcome),
        Some(tree_of(&alice_group.export_ratchet_tree().unwrap())),
    )
    .unwrap();

    // Add Charles. Bob has to process the commit so his copy of the
    // group advances to the same epoch.
    let charles_kp = charles.key_package(&charles_p_mut).unwrap();
    let add_charles = alice_group
        .add_member(&alice_p_mut, &charles_kp)
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();

    let processed = bob_group
        .receive(&mut bob_p_mut, &add_charles.commit)
        .unwrap();
    assert!(matches!(processed.kind(), ProcessedKind::Commit));

    let mut charles_group = Group::join(
        &charles_p_mut,
        welcome_of(&add_charles.welcome),
        Some(tree_of(&alice_group.export_ratchet_tree().unwrap())),
    )
    .unwrap();

    // All three can decrypt the same application message.
    let msg = b"hello group";
    let ct = alice_group
        .encrypt_application(&alice_p_mut, msg)
        .unwrap();
    for (group, prov) in [
        (&mut bob_group, &mut bob_p_mut),
        (&mut charles_group, &mut charles_p_mut),
    ] {
        let p = group.receive(prov, &ct).unwrap();
        assert!(matches!(p.kind(), ProcessedKind::Application));
        assert_eq!(p.application(), msg);
    }
}

/// After `remove_member` is committed, Alice's epoch advances past Bob's.
#[test]
fn remove_member_advances_epoch() {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let mut alice_p_mut = alice_p;
    let bob_p_mut = bob_p;

    let mut alice_group = Group::create_new(&alice_p_mut, &alice, b"conv").unwrap();
    let bob_kp = bob.key_package(&bob_p_mut).unwrap();
    let add = alice_group.add_member(&alice_p_mut, &bob_kp).unwrap();
    alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();
    let bob_group = Group::join(
        &bob_p_mut,
        welcome_of(&add.welcome),
        Some(tree_of(&alice_group.export_ratchet_tree().unwrap())),
    )
    .unwrap();

    let bob_epoch_before = bob_group.epoch();
    assert_eq!(alice_group.epoch(), bob_epoch_before);

    // Bob's leaf is at index 1 (Alice is 0).
    let _remove = alice_group
        .remove_member(&alice_p_mut, 1)
        .unwrap();
    alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();

    assert!(
        alice_group.epoch() > bob_epoch_before,
        "alice's epoch must advance after a remove commit"
    );
    // Bob's group state is left at the old epoch — his client never
    // applies a commit that excludes its own leaf, which is exactly
    // the "your device just got revoked" UI signal Phase 6 wires up.
}

/// After self-update(), the new epoch advances. Both sides keep
/// decrypting in lockstep.
#[test]
fn self_update_advances_epoch() {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let mut alice_p_mut = alice_p;
    let mut bob_p_mut = bob_p;

    let mut alice_group = Group::create_new(&alice_p_mut, &alice, b"conv").unwrap();
    let bob_kp = bob.key_package(&bob_p_mut).unwrap();
    let add = alice_group.add_member(&alice_p_mut, &bob_kp).unwrap();
    alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();
    let mut bob_group = Group::join(
        &bob_p_mut,
        welcome_of(&add.welcome),
        Some(tree_of(&alice_group.export_ratchet_tree().unwrap())),
    )
    .unwrap();

    let epoch_before = alice_group.epoch();

    let upd = alice_group.update(&alice_p_mut).unwrap();
    alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();

    // Bob processes the update commit.
    let processed = bob_group.receive(&mut bob_p_mut, &upd.commit).unwrap();
    assert!(matches!(processed.kind(), ProcessedKind::Commit));

    let epoch_after = alice_group.epoch();
    assert!(
        epoch_after > epoch_before,
        "epoch should advance after self_update"
    );
    assert_eq!(
        alice_group.epoch(),
        bob_group.epoch(),
        "epochs should match"
    );

    // And messages still flow.
    let ct = alice_group
        .encrypt_application(&alice_p_mut, b"post-update")
        .unwrap();
    let processed = bob_group.receive(&mut bob_p_mut, &ct).unwrap();
    assert_eq!(processed.application(), b"post-update");
}

/// `export_secret` returns the same bytes on both sides.
#[test]
fn exported_secrets_match() {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let mut alice_p_mut = alice_p;
    let bob_p_mut = bob_p;

    let mut alice_group = Group::create_new(&alice_p_mut, &alice, b"conv").unwrap();
    let bob_kp = bob.key_package(&bob_p_mut).unwrap();
    let add = alice_group.add_member(&alice_p_mut, &bob_kp).unwrap();
    alice_group.merge_pending_commit(&mut alice_p_mut).unwrap();
    let bob_group = Group::join(
        &bob_p_mut,
        welcome_of(&add.welcome),
        Some(tree_of(&alice_group.export_ratchet_tree().unwrap())),
    )
    .unwrap();

    let label = "pinai/attachment-key/v1";
    let context = b"attachment-uuid-deadbeef";
    let len = 32;
    let alice_key = alice_group
        .export_secret(&alice_p_mut, label, context, len)
        .unwrap();
    let bob_key = bob_group.export_secret(&bob_p_mut, label, context, len).unwrap();
    assert_eq!(alice_key, bob_key);
    assert_eq!(alice_key.len(), len);
}
