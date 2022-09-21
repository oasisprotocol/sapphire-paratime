var express = require("express");
var cors = require("cors");
var ethers = require("ethers");

var ItemPurchaseShop = require("./shared/abi/ItemPurchaseShop.json");
// var Sapphire = require('@oasisprotocol/sapphire-paratime');

var privateKey =
  "8a61cab2fd89c40c0f87275f2547bf0139fe78c4aa37eed0ee4357ce88033aae";

var endpoint = "http://127.0.0.1:7545";
var networkId = 5777;

// var endpoint = 'https://testnet.sapphire.oasis.dev';
// var networkId = 23295;

var ethersProvider = ethers.ethers.getDefaultProvider(endpoint);
var myWallet = new ethers.Wallet("0x" + privateKey, ethersProvider);

var signer = myWallet;
// var signer = Sapphire.wrap(myWallet);

var shopContract = new ethers.Contract(
  ItemPurchaseShop.networks[networkId].address,
  ItemPurchaseShop.abi,
  signer
);

var app = express();
var port = 3001;

var purchasedItems = {};

app.use(cors());

app.get("/purchased", async (req, res, next) => {
  var requester = req.query.address;
  console.log("\nRequester:", requester);
  if (!purchasedItems[requester]) {
    purchasedItems[requester] = [];
  }
  try {
    var num = await shopContract.getTotalNumOfOrders(requester, {
      from: myWallet.address,
    });
    var totalPurchaseNum = Number(num);
    console.log("totalPurchase: ", totalPurchaseNum);
    if (totalPurchaseNum > 0) {
      var initalAmount = purchasedItems[requester].length;
      if (initalAmount == totalPurchaseNum) {
        console.log("No more purchase for this period");
      } else {
        console.log("We detect the requester has new items:");
      }
      for (i = initalAmount + 1; i <= totalPurchaseNum; i++) {
        var itemId = Number(
          await shopContract.getPurchaseItemAtIndex(requester, i, {
            from: myWallet.address,
          })
        );
        console.log("the ", i, "th new item is: ", itemId);
        purchasedItems[requester].push(itemId);
      }
    }
  } catch (err) {
    console.log("There are errors for fetching blockchain data: ", err);
  }

  res.send({ list: purchasedItems[requester] });
});

app.listen(port, () => {
  console.log(`Shop server listening on port ${port}`);
});
