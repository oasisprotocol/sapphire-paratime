// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Counters.sol";

import "./@oasisprotocol-sapphire-contracts/token/ERC721C/ERC721C.sol";
import "./@oasisprotocol-sapphire-contracts/token/ERC721C/extensions/ERC721CURIStorage.sol";

/// @notice The Arcanum is a collection of powerful magic spells, each of which
/// is a closely guarded secret of a Virtuous Wizard shared only with the several
/// apprentices. When the Wizard is about to ascend to a higher plane, the spell
/// will be bestowed unto an apprentice, who becomes a Wizard.
/// In no situation may a spell be revealed to a Corrupt Wizard, and apprentices
/// identities must be kept secret to prevent being targeted by the forces of evil.
/// There are many spells in the world, so it's not a problem if the Corrupt Wizards
/// know the size of The Arcanum, as long as they don't know how to counter what's in it.
contract Arcanum is ERC721C, ERC721URIStorage {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    /// @dev The apprentices that have be granted permission to learn the spell.
    /// The 0th element must not exist as 0 is not uniquely representable in `_allowListIndices`.
    mapping(uint256 => address[]) private _allowList;
    /// @dev The index of each apprentice in each spell's allow list. This structure
    /// supports efficient queries when the allow list is not publicly enumerable, but
    /// this and `_allowList` must be kept in sync.
    mapping(uint256 => mapping(address => uint256)) private _allowListIndices;

    constructor() ERC721C("The Arcanum", "SPELL") {
        return;
    }

    /// @notice Grants an apprentice access to a spell.
    function grantAccess(uint256 tokenId, address apprentice) external {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "Arcanum: not permissible"
        );
        address[] storage allowed = _allowList[tokenId];
        if (_allowListIndices[tokenId][apprentice] != 0) return;
        allowed.push(apprentice);
        _allowListIndices[tokenId][apprentice] = allowed.length - 1;
    }

    /// @notice Revokes an apprentice's access to a spell in case they may be corrupted.
    function revokeAccess(uint256 tokenId, address apprentice) external {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "Arcanum: not permissible"
        );
        mapping(address => uint256) storage ixs = _allowListIndices[tokenId];
        uint256 oldIx = ixs[apprentice];
        if (oldIx == 0) return; // Doesn't exist. Nothing to do.
        delete ixs[apprentice];
        address[] storage allowed = _allowList[tokenId];
        // Execute a swap-remove to keep the allow list compact for enumeration.
        address displaced = allowed[allowed.length - 1];
        allowed.pop();
        allowed[oldIx] = displaced;
        ixs[displaced] = oldIx;
    }

    /// @notice Called when a Wizard discovers a new spell. The spell will be
    /// guarded by the caller.
    function safeMint(string memory uri) external {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(_msgSender(), tokenId);
        _setTokenURI(tokenId, uri);
        _allowList[tokenId].push(address(0)); // The 0th element is a sentinel for non-existence.
    }

    /// @notice Returns the list of apprentices that have access to the spell.
    /// Only the Wizard or approved  may can call this method.
    function getAllowList(
        uint256 tokenId,
        uint256 offset,
        uint256 count
    ) external view returns (address[] memory) {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "Arcanum: not permissible"
        );
        address[] memory allowed;
        for (uint256 i; i < count; ++i) {
            allowed[i] = _allowList[tokenId][offset + i];
        }
        return allowed;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721C, ERC721URIStorage)
        returns (string memory)
    {
        // Short circuiting here doesn't reveal anything since the owner definitely knows whether
        // the token exists. Otherwise, the else branch will always be executed by third parties.
        bool accessible = _isApprovedOrOwner(_msgSender(), tokenId) ||
            _allowListIndices[tokenId][msg.sender] != 0;
        // If there's no access, pretend that the token doesn't exist, but invoke the
        // same code path to keep gas use equal.
        return super.tokenURI(accessible ? tokenId : type(uint256).max);
    }

    /// @dev This following is required to be overridden by Solidity.
    function _burn(uint256 tokenId)
        internal
        override(ERC721C, ERC721URIStorage)
    {
        super._burn(tokenId);
    }
}
