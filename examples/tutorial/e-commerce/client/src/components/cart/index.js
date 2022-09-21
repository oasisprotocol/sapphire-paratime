import React, { Component } from "react";
import "./index.css";

export default class Cart extends Component {
  render() {
    return (
      <div className="card my-16 mr-25 flex-30">
        <section className="layout-row align-items-center justify-content-center px-16">
          <h4>Purchased Items</h4>
        </section>
        <div className="divider" />
        <table>
          <thead>
            <tr>
              <th></th>
              <th></th>
              <th>Item</th>
              <th className="numeric">Price</th>
            </tr>
          </thead>
          <tbody>
            {this.props.cart.items.map((cartItem, idx) => {
              return (
                <tr
                  data-testid={"cart-item-" + idx}
                  key={idx + 1}
                  className="slide-up-fade-in"
                >
                  <td>{idx + 1}.</td>
                  <td>
                    <img src={cartItem.avatar} className="hero-avatar"></img>
                  </td>
                  <td className="name" data-testid="cart-item-name">
                    {cartItem.name}
                  </td>
                  <td
                    className="numeric quantity"
                    data-testid="cart-item-quantity"
                  >
                    {cartItem.price}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
}
