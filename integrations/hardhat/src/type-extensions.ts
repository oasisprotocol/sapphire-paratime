import 'hardhat/types/config';

declare module 'hardhat/types/config' {
  export interface HardhatNetworkUserConfig {
    confidential?: boolean;
  }
}
