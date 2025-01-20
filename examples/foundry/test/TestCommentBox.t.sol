// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "forge-std/Vm.sol";
import "lib/oasisprotocol-sapphire-foundry/BaseSapphireTest.sol";
import "../src/CommentBox.sol";
import "../src/Gasless.sol";


contract CommentBoxTest is SapphireTest {
    CommentBox commentBox;
    Gasless gasless;
    EthereumKeypair wallet;

    function setUp() public override {
        // Call parent setUp first which deploys the Sapphire precompiles
        super.setUp();
        commentBox = new CommentBox();
        console.log("deployed CommentBox to: ", address(commentBox));

        // Generate signer account for gasless tx
        bytes32 secret = keccak256(
            abi.encodePacked(block.timestamp, block.prevrandao)
        );
        address walletAddress = vm.addr(uint256(secret));
        console.logBytes32(secret);
        vm.deal(walletAddress, 10 ether);
        
        wallet = EthereumKeypair({
            addr: walletAddress,
            secret: secret,
            nonce: uint64(vm.getNonce(walletAddress))
        });

        gasless = new Gasless(wallet);
        console.log("deployed Gasless to: ", address(gasless));
        console.log("gasless address: ", wallet.addr);
    }

    function testComment() public {
        uint256 prevCommentCount = commentBox.commentCount();

        commentBox.comment("Hello, world!");
        assertEq(commentBox.commentCount(), prevCommentCount + 1);
    }

    function testCommentGaslessEncrypted() public {
        commentGasless("Hello, c10l world", false);
    }

    function testCommentGaslessPlain() public {
        commentGasless("Hello, plain world", true);
    }


    function commentGasless(
        string memory comment,
        bool plainProxy
    ) internal {
        bytes memory innercall = 
        abi.encodeWithSignature("comment(string)", comment);

        uint256 prevCommentCount = commentBox.commentCount();
        bytes memory raw_tx;
        if (plainProxy) {
            raw_tx = gasless.makeProxyTxPlain(address(commentBox), innercall);
        } else {
            raw_tx = gasless.makeProxyTx(address(commentBox), innercall);
        }
        vm.broadcastRawTransaction(raw_tx);

        assertEq(commentBox.commentCount(), prevCommentCount + 1);
    }
}
