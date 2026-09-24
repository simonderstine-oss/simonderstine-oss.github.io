(function () {
  "use strict";

  var CART_KEY = "impact_demo_cart";

  function read() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function write(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateBadge();
  }

  function findProduct(id) {
    return (window.PRODUCTS || []).find(function (p) {
      return p.id === id;
    });
  }

  function addToCart(productId, qty) {
    qty = qty || 1;
    var items = read();
    var existing = items.find(function (i) {
      return i.id === productId;
    });
    if (existing) existing.quantity += qty;
    else items.push({ id: productId, quantity: qty });
    write(items);
  }

  function setQty(productId, qty) {
    var items = read().filter(function (i) {
      if (i.id !== productId) return true;
      i.quantity = qty;
      return qty > 0;
    });
    write(items);
  }

  function clearCart() {
    write([]);
  }

  function getLineItems() {
    return read()
      .map(function (line) {
        var p = findProduct(line.id);
        if (!p) return null;
        return {
          sku: p.id,
          name: p.name,
          category: p.category,
          quantity: line.quantity,
          unitPrice: p.price,
          subTotal: Math.round(p.price * line.quantity * 100) / 100,
        };
      })
      .filter(Boolean);
  }

  function getSubtotal() {
    return getLineItems().reduce(function (sum, i) {
      return sum + i.subTotal;
    }, 0);
  }

  function count() {
    return read().reduce(function (n, i) {
      return n + i.quantity;
    }, 0);
  }

  function updateBadge() {
    var el = document.getElementById("cart-count");
    if (!el) return;
    var n = count();
    el.textContent = String(n);
    el.hidden = n === 0;
  }

  function formatMoney(n) {
    return "$" + Number(n).toFixed(2);
  }

  window.DemoCart = {
    addToCart: addToCart,
    setQty: setQty,
    clearCart: clearCart,
    getLineItems: getLineItems,
    getSubtotal: getSubtotal,
    count: count,
    updateBadge: updateBadge,
    formatMoney: formatMoney,
  };

  document.addEventListener("DOMContentLoaded", updateBadge);
})();
