require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Admin = require('../models/Admin');

const sampleProducts = [
  {
    name: 'Chase Bank Log',
    description: 'Fresh Chase bank log with full access. Includes email and security questions. Balance $5,000+. Verified and tested.',
    price: 120.00,
    category: 'bank_log',
    stock: 10,
    deliveryType: 'manual',
    deliveryContent: '',
  },
  {
    name: 'BOA Bank Log Premium',
    description: 'Bank of America premium log. Full info with cookies and session. High balance, clean IP. Instant delivery after verification.',
    price: 150.00,
    category: 'bank_log',
    stock: 5,
    deliveryType: 'manual',
    deliveryContent: '',
  },
  {
    name: 'Netflix Premium Account',
    description: '1-year Netflix Premium subscription. 4K UHD, 4 screens. Fresh account with warranty replacement.',
    price: 15.99,
    category: 'digital_goods',
    stock: -1,
    deliveryType: 'license_key',
    deliveryContent: '',
    licenseKeys: [
      { key: 'NF-PRO-1111-AAAA', used: false },
      { key: 'NF-PRO-2222-BBBB', used: false },
      { key: 'NF-PRO-3333-CCCC', used: false },
    ],
  },
  {
    name: 'Spotify Family Lifetime',
    description: 'Spotify Family plan with lifetime warranty. Up to 6 members. Instant delivery.',
    price: 9.99,
    category: 'digital_goods',
    stock: -1,
    deliveryType: 'license_key',
    deliveryContent: '',
    licenseKeys: [
      { key: 'SPT-FAM-1111', used: false },
      { key: 'SPT-FAM-2222', used: false },
    ],
  },
  {
    name: 'Fullz Bank Opening Package',
    description: 'Complete fullz package for bank opening. SSN, DL, DOB, address history. Clean and fresh. Includes tutorial guide.',
    price: 85.00,
    category: 'bank_opening',
    stock: 20,
    deliveryType: 'manual',
    deliveryContent: '',
  },
  {
    name: 'Business Bank Opening Kit',
    description: 'Full EIN package with registered agent for business bank opening. Includes LLC docs and EIN letter.',
    price: 250.00,
    category: 'bank_opening',
    stock: 8,
    deliveryType: 'manual',
    deliveryContent: '',
  },
  {
    name: 'SMS Bomber Tool',
    description: 'Advanced SMS verification tool with 50+ carrier support. API access included. 30-day license.',
    price: 35.00,
    category: 'tools',
    stock: -1,
    deliveryType: 'download_link',
    deliveryContent: 'https://example.com/downloads/sms-tool-v3.zip',
  },
  {
    name: 'Anti-Detect Browser Pro',
    description: 'Multi-profile browser with fingerprint masking. Unlimited profiles, proxy integration. 1-month subscription.',
    price: 45.00,
    category: 'tools',
    stock: -1,
    deliveryType: 'license_key',
    deliveryContent: '',
    licenseKeys: [
      { key: 'ADB-PRO-1111', used: false },
      { key: 'ADB-PRO-2222', used: false },
    ],
  },
  {
    name: 'RDP Windows Server',
    description: 'Dedicated RDP server. Windows Server 2022, 8GB RAM, 100GB SSD. Clean IP, 30-day subscription.',
    price: 25.00,
    category: 'tools',
    stock: -1,
    deliveryType: 'manual',
    deliveryContent: '',
  },
  {
    name: 'VPN + Socks5 Combo',
    description: 'Premium VPN with residential Socks5 proxy access. 50+ countries, unlimited bandwidth. 30-day plan.',
    price: 19.99,
    category: 'tools',
    stock: -1,
    deliveryType: 'license_key',
    deliveryContent: '',
    licenseKeys: [
      { key: 'VPN-S5-1111', used: false },
      { key: 'VPN-S5-2222', used: false },
      { key: 'VPN-S5-3333', used: false },
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
