require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/marketplace';

async function fixSKUIndex() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collections = await db.listCollections({ name: 'products' }).toArray();
    
    if (collections.length === 0) {
      console.log('⚠️  Products collection not found');
      process.exit(0);
    }

    // Drop the problematic SKU index
    try {
      await db.collection('products').dropIndex('sku_1');
      console.log('✅ Dropped old sku_1 index');
    } catch (err) {
      if (err.message.includes('index not found')) {
        console.log('ℹ️  Index sku_1 doesn\'t exist (already removed)');
      } else {
        throw err;
      }
    }

    // Get all products with empty/null SKU
    const productsNeedingSKU = await db.collection('products').find({ 
      $or: [
        { sku: null },
        { sku: '' },
        { sku: { $exists: false } }
      ]
    }).toArray();

    console.log(`\n📝 Found ${productsNeedingSKU.length} products with empty/missing SKU`);

    // Generate unique SKUs for these products
    for (const product of productsNeedingSKU) {
      const sku = product.name.substring(0, 3).toUpperCase() + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
      await db.collection('products').updateOne(
        { _id: product._id },
        { $set: { sku } }
      );
      console.log(`  ✓ ${product.name} → ${sku}`);
    }

    // Create new sparse unique index on SKU
    try {
      await db.collection('products').createIndex(
        { sku: 1 },
        { unique: true, sparse: true }
      );
      console.log('\n✅ Created new sparse unique index on SKU');
    } catch (err) {
      console.error('Error creating index:', err.message);
    }

    console.log('\n✅ Migration complete! You can now run seeding without errors.');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

fixSKUIndex();
