// mongo-init.js — runs once on first container startup
db = db.getSiblingDB('ekalavya');

// Create app-level user (least privilege)
db.createUser({
  user: 'ekalavya_app',
  pwd:  'ekalavya_app_pass',
  roles: [{ role: 'readWrite', db: 'ekalavya' }],
});

// Create collections with validation
db.createCollection('members', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email', 'phone', 'interests', 'created_at'],
      properties: {
        name:    { bsonType: 'string' },
        email:   { bsonType: 'string' },
        phone:   { bsonType: 'string' },
        interests: { bsonType: 'array' },
        status:  { enum: ['pending', 'approved', 'active', 'inactive'] },
        created_at: { bsonType: 'date' },
      },
    },
  },
});

db.createCollection('feedback', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email', 'message', 'created_at'],
    },
  },
});

// Indexes
db.members.createIndex({ email: 1 }, { unique: true });
db.members.createIndex({ phone: 1 });
db.members.createIndex({ status: 1 });
db.members.createIndex({ interests: 1 });
db.members.createIndex({ created_at: -1 });

db.feedback.createIndex({ created_at: -1 });
db.feedback.createIndex({ email: 1 });

print('✅  ekalavya DB initialised');
