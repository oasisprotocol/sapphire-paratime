const keccak256 = require("web3").utils.keccak256;

const MetaCoin = artifacts.require("MetaCoin");

async function exerciseContract() {
  const mc = await MetaCoin.deployed();

  const tx = await mc.sendCoin(mc.address, 42);
  console.log(`\nSent some coins in ${tx.tx}.`);
  const t = tx.logs[0].args;
  console.log(`A Transfer(${t[0]}, ${t[0]}, ${t[2].toNumber()}) was emitted.`);

  const storageSlot = await new Promise((resolve, reject) => {
    const getStoragePayload = {
      method: "eth_getStorageAt",
      params: [
        mc.address,
        keccak256(
          "0x" + "00".repeat(12) + mc.address.slice(2) + "00".repeat(32)
        ),
        "latest",
      ],
      jsonrpc: "2.0",
      id: "test",
    };
    mc.contract.currentProvider.send(getStoragePayload, (err, res) => {
      if (err) reject(err);
      else resolve(res.result);
    });
  });
  console.log(`The balance storage slot contains ${storageSlot}.`);

  const balance = await mc.getBalance(mc.address);
  console.log(`The contract now has balance: ${balance.toNumber()}.`);
}

module.exports = async function (callback) {
  try {
    await exerciseContract();
  } catch (e) {
    console.error(e);
  }
  callback();
};
