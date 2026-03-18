const { v4: uuidv4 } = require('uuid');

function generateOrderNumber() {
  const prefix = 'ORD';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = uuidv4().slice(0, 4).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

function formatPrice(price) {
  return `$${price.toFixed(2)}`;
}

function escapeMarkdown(text) {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function truncate(str, len = 50) {
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}

module.exports = {
  generateOrderNumber,
  formatPrice,
  escapeMarkdown,
  truncate,
};
