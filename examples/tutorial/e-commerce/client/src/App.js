import React, { Component } from "react";
import Web3 from "web3";
import "h8k-components";
// import * as Sapphire from '@oasisprotocol/sapphire-paratime';

import ItemPurchaseShop from "./shared/abi/ItemPurchaseShop.json";
import ConfidentialToken from "./shared/abi/ConfidentialToken.json";
import ProductList from "./components/product-list";
import Cart from "./components/cart";
import "./App.css";

const title = "Confidential Payment";

class App extends Component {
  async componentWillMount() {
    await this.loadWeb3();
    await this.loadBlockchainData();
    await this.syncServer();
    setInterval(this.syncServer.bind(this), 1000);
  }

  async loadWeb3() {
    if (window.ethereum) {
      const provider = window.ethereum;
      //	const provider = Sapphire.wrap(window.ethereum);
      window.web3 = new Web3(provider);
      await window.ethereum.enable();
    } else {
      window.alert(
        "Non-Ethereum browser detected. You should consider trying MetaMask!"
      );
    }
  }

  async loadBlockchainData() {
    const web3 = window.web3;
    const accounts = await web3.eth.getAccounts();
    this.setState({ account: accounts[0] });

    // Load smart contract
    const networkId = await web3.eth.net.getId();
    const tokenNetworkData = ConfidentialToken.networks[networkId];
    const shopNetworkData = ItemPurchaseShop.networks[networkId];
    if (tokenNetworkData && shopNetworkData) {
      const tokenAbi = ConfidentialToken.abi;
      const tokenAddress = tokenNetworkData.address;
      console.log("token address: ", tokenAddress);
      const token = new web3.eth.Contract(tokenAbi, tokenAddress);

      const shopAbi = ItemPurchaseShop.abi;
      const shopAddress = shopNetworkData.address;
      console.log("shop address: ", shopAddress);
      const shop = new web3.eth.Contract(shopAbi, shopAddress);

      // Load Tokens
      let balance = await token.methods
        .balanceOf(accounts[0])
        .call({ from: accounts[0] });
      this.setState({ token, shop, balance });
    }
  }

  async syncServer() {
    const response = await fetch(
      `http://localhost:3001/purchased?address=${this.state.account}`
    );
    const purchaseList = (await response.json()).list;
    console.log("purchased list:", purchaseList);
    const products = [...this.state.products].map((product, index) => {
      if (purchaseList.includes(product.id)) {
        product.purchased = true;
      }
      return product;
    });
    this.updateCartState(products);
  }

  constructor() {
    super();
    const products = [...PRODUCTS].map((product, index) => {
      product.id = index + 1;
      product.image = `/images/items/${product.name}.png`;
      product.avatar = `/images/items/${product.name}-avatar.png`;
      product.purchased = false;
      product.pending = false;
      return product;
    });
    this.state = {
      cart: {
        items: [],
      },
      products,
      account: "0x0",
      balance: 0,
      token: null,
      game: null,
    };
  }

  async purchaseItem(item) {
    const products = [...this.state.products].map((product, index) => {
      if (product.id === item.id) {
        product.pending = true;
      }
      return product;
    });
    this.updateCartState(products);

    const token = this.state.token;
    const shop = this.state.shop;

    await token.methods
      .approve(shop._address, item.price)
      .send({ from: this.state.account, gas: 4700000 });
    await shop.methods
      .purchase(item.id, token._address, item.price)
      .send({ from: this.state.account, gas: 4700000 });
  }

  updateCartState = (products) => {
    const items = [...this.state.products].filter(
      (product) => product.purchased
    );
    this.setState({ cart: { items }, products });
  };

  render() {
    const whiteStyle = {
      color: "white",
    };
    const greenStyle = {
      color: "lightgreen",
    };
    return (
      <div>
        <nav className="app-header layout-row justify-content-between">
          <div className="layout-row align-items-center">
            <img alt="" src="favicon.ico" className="logo mr-10" />
            <h4 id="app-title" data-testid="app-title" className="app-title">
              {title}
            </h4>
          </div>
          <div>
            <small className="text-muted" style={whiteStyle}>
              <span id="account">{this.state.account + ": "}</span>
            </small>
            <small className="text-muted" style={greenStyle}>
              <span id="account">{this.state.balance + " CGT"}</span>
            </small>
          </div>
        </nav>
        <div className="layout-row shop-component">
          <ProductList
            purchase={this.purchaseItem.bind(this)}
            products={this.state.products}
          />
          <Cart cart={this.state.cart} />
        </div>
      </div>
    );
  }
}

export const PRODUCTS = [
  {
    name: "Rose-625",
    price: 5,
  },
  {
    name: "Rose-793",
    price: 30,
  },
  {
    name: "Rose-21",
    price: 35,
  },
  {
    name: "Rose-54",
    price: 50,
  },
  {
    name: "Rose-103",
    price: 35,
  },
  {
    name: "Rose-602",
    price: 35,
  },
  {
    name: "Rose-202",
    price: 30,
  },
  {
    name: "Rose-303",
    price: 35,
  },
  {
    name: "Rose-20",
    price: 25,
  },
  {
    name: "Rose-51",
    price: 10,
  },
  {
    name: "Rose-931",
    price: 55,
  },
];
export default App;
