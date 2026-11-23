//! Pīna'i's MLS engine in plain Rust: the surface the clients use around openmls, and HPKE.
//! Network bytes are parsed into `wire`'s types at the entry; every failure is an [`MlsError`].

mod config;
mod error;
mod group;
mod identity;
mod key_package;
mod processed;
mod provider;
#[cfg(test)]
mod testing;
mod wire;

pub use error::MlsError;
pub use group::{AddOutput, CommitOutput, ExternalJoin, Group, GroupMember};
pub use identity::Identity;
pub use key_package::KeyPackage;
pub use processed::{ProcessedKind, ProcessedMessage};
pub use provider::Provider;
pub use wire::{IncomingGroupInfo, IncomingMessage, IncomingWelcome, RatchetTree};
