const Product = require('../models/Product');

exports.getAll = async (req, res) => {
  try {
    const { status, category, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ products, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, price, category, stock, status, deliveryType, deliveryContent, image, licenseKeys } = req.body;

    const product = await Product.create({
      name,
      description,
      price,
      category: category || 'general',
      stock: stock !== undefined ? stock : -1,
      status: status || 'active',
      deliveryType: deliveryType || 'download_link',
      deliveryContent: deliveryContent || '',
      image: image || null,
      licenseKeys: licenseKeys || [],
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: 'inactive' },
      { new: true }
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deactivated', product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.hardDelete = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product permanently deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addLicenseKeys = async (req, res) => {
  try {
    const { keys } = req.body;
    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ error: 'Provide an array of license keys' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const newKeys = keys.map((k) => ({ key: k, used: false }));
    product.licenseKeys.push(...newKeys);
    await product.save();

    res.json({ message: `${newKeys.length} keys added`, total: product.licenseKeys.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
