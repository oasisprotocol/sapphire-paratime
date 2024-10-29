// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;
import {RLPWriter} from "./RLPWriter.sol";

library EIPTypes {
    struct AccessList {
        AccessListItem[] items;
    }
    
    struct AccessListItem {
        address addr;
        bytes32[] storageKeys;
    }
    
    /**
     * @notice Encode an access list for EIP-1559 and EIP-2930 transactions
     */
    function encodeAccessList(AccessList memory list)
        internal
        pure
        returns (bytes memory)
    {
        bytes[] memory items = new bytes[](list.items.length);
        
        for (uint i = 0; i < list.items.length; i++) {
            bytes[] memory item = new bytes[](2);
            // Encode the address
            item[0] = RLPWriter.writeAddress(list.items[i].addr);
            
            // Encode storage keys
            bytes[] memory storageKeys = new bytes[](list.items[i].storageKeys.length);
            for (uint j = 0; j < list.items[i].storageKeys.length; j++) {
                // Use writeBytes for the full storage key
                storageKeys[j] = RLPWriter.writeBytes(abi.encodePacked(list.items[i].storageKeys[j]));
            }
            item[1] = RLPWriter.writeList(storageKeys);
            
            items[i] = RLPWriter.writeList(item);
        }
        
        return RLPWriter.writeList(items);
    }
}