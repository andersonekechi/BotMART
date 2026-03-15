require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Admin = require('../models/Admin');

const sampleProducts = [
  {
    name: 'Premium VPN Tool',
    description: 'High-speed VPN with 100+ server locations. Unlimited bandwidth, no-logs policy, and military-grade encryption.',
    price: 29.99,
    category: 'security',
    stock: -1,
    deliveryType: 'license_key',
    deliveryContent: '',
    licenseKeys: [
      { key: 'VPN-XXXX-1111-AAAA', used: false },
      { key: 'VPN-XXXX-2222-BBBB', used: false },
      { key: 'VPN-XXXX-3333-CCCC', used: false },
    ],
  },
  {
    name: 'SEO Toolkit Pro',
    description: 'Complete SEO analysis suite with keyword research, backlink checker, site audit, and rank tracker. 1-year license.',
    price: 49.99,
    category: 'marketing',
    stock: 50,
    deliveryType: 'license_key',
    deliveryContent: '',
    licenseKeys: [
      { key: 'SEO-PRO-1111-AAAA', used: false },
      { key: 'SEO-PRO-2222-BBBB', used: false },
    ],
  },
  {
    name: 'Social Media Automation Bot',
    description: 'Automate posting, scheduling, and engagement across Instagram, Twitter, and Facebook. Cloud-based, no installation needed.',
    price: 19.99,
    category: 'automation',
    stock: -1,
    deliveryType: 'download_link',
    deliveryContent: 'https://example.com/downloads/social-bot-v2.zip',
  },
  {
    name: 'Email Marketing Suite',
    description: 'Bulk email sender with templates, analytics, and deliverability optimization. Supports up to 50,000 emails/month.',
    price: 39.99,
    category: 'marketing',
    stock: 100,
    deliveryType: 'license_key',
    deliveryContent: '',
    licenseKeys: [
      { key: 'EMAIL-SUITE-1111', used: false },
      { key: 'EMAIL-SUITE-2222', used: false },
    ],
  },
  {
    name: 'Web Scraping Framework',
    description: 'Advanced web scraping toolkit with proxy rotation, CAPTCHA solving, and data export. Python & Node.js compatible.',
    price: 24.99,
    category: 'development',
    stock: -1,
    deliveryType: 'download_link',
    deliveryContent: 'https://example.com/downloads/scraper-framework-v3.tar.gz',
  },
  {
    name: 'Password Manager Pro',
    description: 'Secure password manager with encrypted vault, auto-fill, 2FA support, and cross-device sync. Lifetime license.',
    price: 14.99,
    category: 'security',
    stock: 200,
    deliveryType: 'license_key',
    deliveryContent: '',
    licenseKeys: [
      { key: 'PWD-MGR-PRO-1111', used: false },
      { key: 'PWD-MGR-PRO-2222', used: false },
      { key: 'PWD-MGR-PRO-3333', used: false },
    ],
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    await Product.deleteMany({});
    console.log('Cleared products');

    await Product.insertMany(sampleProducts);
    console.log(`Seeded ${sampleProducts.length} products`);

    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      await Admin.create({ username: 'admin', password: 'admin123', role: 'superadmin' });
      console.log('Created default admin (admin / admin123)');
    }

    console.log('Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();
