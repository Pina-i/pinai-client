//! Pīna'i's MLS engine in plain Rust: the surface the clients use around openmls, and HPKE.
//! Network bytes are parsed into `wire`'s types at the entry; every failure is an [`MlsError`].

mod config;
mod error;

pub use error::MlsError;
