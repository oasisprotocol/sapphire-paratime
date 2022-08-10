//! The Sapphire ParaTime.
#![deny(rust_2018_idioms, single_use_lifetimes, unreachable_pub)]

use std::collections::{BTreeMap, BTreeSet};

#[cfg(target_env = "sgx")]
use oasis_runtime_sdk::core::consensus::verifier::TrustRoot;
use oasis_runtime_sdk::{
    self as sdk, config,
    core::common::crypto::signature::PublicKey,
    keymanager::TrustedPolicySigners,
    modules,
    types::token::{BaseUnits, Denomination},
    Module, Version,
};
use once_cell::unsync::Lazy;

/// Configuration of the various modules.
pub struct Config;

/// Determine whether the build is for Testnet.
///
/// If the crate version has a pre-release component (e.g. 3.0.0-alpha) then the build is classified
/// as Testnet. If there is no such component (e.g. 5.0.0) then it is classified as Mainnet.
const fn is_testnet() -> bool {
    !env!("CARGO_PKG_VERSION_PRE").is_empty()
}

/// Determine EVM chain ID to use depending on whether the build is for Testnet or Mainnet.
const fn chain_id() -> u64 {
    if is_testnet() {
        // Testnet.
        0x5aff
    } else {
        // Mainnet.
        0x5afe
    }
}

impl modules::core::Config for Config {
    /// Default local minimum gas price configuration that is used in case no overrides are set in
    /// local per-node configuration.
    const DEFAULT_LOCAL_MIN_GAS_PRICE: Lazy<BTreeMap<Denomination, u128>> =
        Lazy::new(|| [(Denomination::NATIVE, 100_000_000_000)].into());

    /// Methods which are exempt from minimum gas price requirements.
    const MIN_GAS_PRICE_EXEMPT_METHODS: Lazy<BTreeSet<&'static str>> =
        Lazy::new(|| ["consensus.Deposit"].into());
}

impl module_evm::Config for Config {
    type Accounts = modules::accounts::Module;

    const CHAIN_ID: u64 = chain_id();

    const TOKEN_DENOMINATION: Denomination = Denomination::NATIVE;

    const CONFIDENTIAL: bool = true;
}

/// The EVM ParaTime.
pub struct Runtime;

impl sdk::Runtime for Runtime {
    /// Version of the runtime.
    const VERSION: Version = sdk::version_from_cargo!();
    /// Current version of the global state (e.g. parameters). Any parameter updates should bump
    /// this version in order for the migrations to be executed.
    const STATE_VERSION: u32 = 0;

    /// Schedule control configuration.
    const SCHEDULE_CONTROL: config::ScheduleControl = config::ScheduleControl {
        initial_batch_size: 50,
        batch_size: 50,
        min_remaining_gas: 1_000, // accounts.Transfer method calls.
        max_tx_count: 1_000,      // Consistent with runtime descriptor.
    };

    type Core = modules::core::Module<Config>;

    #[allow(clippy::type_complexity)]
    type Modules = (
        // Core.
        modules::core::Module<Config>,
        // Accounts.
        modules::accounts::Module,
        // Consensus layer interface.
        modules::consensus::Module,
        // Consensus layer accounts.
        modules::consensus_accounts::Module<modules::accounts::Module, modules::consensus::Module>,
        // Rewards.
        modules::rewards::Module<modules::accounts::Module>,
        // EVM.
        module_evm::Module<Config>,
    );

    fn trusted_policy_signers() -> Option<TrustedPolicySigners> {
        if option_env!("OASIS_UNSAFE_SKIP_KM_POLICY") == Some("1") {
            return Some(TrustedPolicySigners::default());
        }
        let tps = cipher_keymanager::trusted_policy_signers();
        // The `cipher_keymanager` crate may use a different version of `oasis_core`
        // so we need to convert the `TrustedPolicySigners` between the versions.
        Some(TrustedPolicySigners {
            signers: tps.signers.into_iter().map(|s| PublicKey(s.0)).collect(),
            threshold: tps.threshold,
        })
    }

    #[cfg(target_env = "sgx")]
    fn consensus_trust_root() -> Option<TrustRoot> {
        if is_testnet() {
            // Testnet.
            Some(TrustRoot {
                height: 11085243,
                hash: "40611473dba904e840cbd9c63a931aa255fa59dced764b174d54e1246d46a608".into(),
                runtime_id: "000000000000000000000000000000000000000000000000a6d1e3ebf60dff6c"
                    .into(),
            })
        } else {
            panic!("no trust root defined for Mainnet");
        }
    }

    fn genesis_state() -> <Self::Modules as sdk::module::MigrationHandler>::Genesis {
        (
            modules::core::Genesis {
                parameters: modules::core::Parameters {
                    min_gas_price: { BTreeMap::from([(Denomination::NATIVE, 100_000_000_000)]) },
                    max_batch_gas: if is_testnet() { 30_000_000 } else { 10_000_000 },
                    max_tx_size: 300 * 1024,
                    max_tx_signers: 1,
                    max_multisig_signers: 8,
                    gas_costs: modules::core::GasCosts {
                        tx_byte: 1,
                        auth_signature: 1_000,
                        auth_multisig_signer: 1_000,
                        callformat_x25519_deoxysii: 10_000,
                    },
                },
            },
            modules::accounts::Genesis {
                parameters: modules::accounts::Parameters {
                    gas_costs: modules::accounts::GasCosts { tx_transfer: 1_000 },
                    denomination_infos: {
                        BTreeMap::from([(
                            Denomination::NATIVE,
                            modules::accounts::types::DenominationInfo {
                                // Consistent with EVM ecosystem.
                                decimals: 18,
                            },
                        )])
                    },
                    ..Default::default()
                },
                ..Default::default()
            },
            modules::consensus::Genesis {
                parameters: modules::consensus::Parameters {
                    // Consensus layer denomination is the native denomination of this runtime.
                    consensus_denomination: Denomination::NATIVE,
                    // Scale to 18 decimal places as this is what is expected in the EVM ecosystem.
                    consensus_scaling_factor: 1_000_000_000,
                },
            },
            modules::consensus_accounts::Genesis {
                parameters: modules::consensus_accounts::Parameters {
                    gas_costs: modules::consensus_accounts::GasCosts {
                        tx_deposit: 10_000,
                        tx_withdraw: 10_000,
                    },
                },
            },
            modules::rewards::Genesis {
                parameters: modules::rewards::Parameters {
                    schedule: modules::rewards::types::RewardSchedule {
                        steps: vec![modules::rewards::types::RewardStep {
                            until: 27_500,
                            amount: BaseUnits::new(3_000_000_000_000_000_000, Denomination::NATIVE),
                        }],
                    },
                    participation_threshold_numerator: 3,
                    participation_threshold_denominator: 4,
                },
            },
            module_evm::Genesis {
                parameters: module_evm::Parameters {
                    gas_costs: module_evm::GasCosts {},
                },
            },
        )
    }

    fn migrate_state<C: sdk::Context>(ctx: &mut C) {
        // State migration from by copying over parameters from updated genesis state.
        let genesis = Self::genesis_state();

        // Core.
        modules::core::Module::<Config>::set_params(ctx.runtime_state(), genesis.0.parameters);
        // Accounts.
        modules::accounts::Module::set_params(ctx.runtime_state(), genesis.1.parameters);
        // Consensus layer interface.
        modules::consensus::Module::set_params(ctx.runtime_state(), genesis.2.parameters);
        // Consensus layer accounts.
        modules::consensus_accounts::Module::<modules::accounts::Module, modules::consensus::Module>::set_params(
            ctx.runtime_state(),
            genesis.3.parameters,
        );
        // Rewards.
        modules::rewards::Module::<modules::accounts::Module>::set_params(
            ctx.runtime_state(),
            genesis.4.parameters,
        );
        // EVM.
        module_evm::Module::<Config>::set_params(ctx.runtime_state(), genesis.5.parameters);
    }
}
