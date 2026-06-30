const mongoose = require('mongoose');

console.log('[MOCK DB] Mocking Mongoose for database-less development...');

mongoose.connect = async () => {
  console.log('[MOCK DB] Successfully established mock database connection.');
};

mongoose.connection = {
  on: (event, cb) => {
    if (event === 'connected') {
      setTimeout(cb, 50);
    }
  },
  close: async () => {
    console.log('[MOCK DB] Closed mock database connection.');
  }
};

const modelsStore = {};
mongoose.model = (name, schema) => {
  if (modelsStore[name]) return modelsStore[name];

  const store = [];
  
  const mockModel = function(data) {
    Object.assign(this, data);
    this.save = async () => {
      console.log(`[MOCK DB] [save] model=${name} _id=${this._id} points=${this.points} robloxId=${this.robloxId}`);
      const idx = store.findIndex(x => x === this || (this._id && x._id === this._id));
      if (idx >= 0) {
        // Only keep plain object values to avoid schema/helper reference leaks
        const plain = {};
        for (const k in this) {
          if (typeof this[k] !== 'function' && k !== 'save') {
            plain[k] = this[k];
          }
        }
        store[idx] = plain;
      } else {
        if (!this._id) this._id = Math.random().toString();
        const plain = {};
        for (const k in this) {
          if (typeof this[k] !== 'function' && k !== 'save') {
            plain[k] = this[k];
          }
        }
        store.push(plain);
      }
      console.log(`[MOCK DB] [save] saved doc points=${store[idx] ? store[idx].points : 'nil'}`);
      return this;
    };
  };

  mockModel.store = store;

  mockModel.find = async () => {
    return store.map(x => new mockModel(x));
  };

  mockModel.findOne = async (query) => {
    console.log(`[MOCK DB] [findOne] model=${name} query=`, JSON.stringify(query));
    const doc = store.find(item => {
      for (const k in query) {
        if (query[k] && typeof query[k] === 'object' && '$ne' in query[k]) {
          const val = query[k]['$ne'];
          if (item[k] === val) return false;
          continue;
        }
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
    console.log(`[MOCK DB] [findOne] found doc points=${doc ? doc.points : 'none'}`);
    if (!doc) return null;
    return new mockModel(doc);
  };

  mockModel.findOneAndUpdate = async (filter, update, options) => {
    console.log(`[MOCK DB] [findOneAndUpdate] model=${name} filter=`, JSON.stringify(filter), "update=", JSON.stringify(update));
    let idx = store.findIndex(item => {
      for (const k in filter) {
        if (filter[k] && typeof filter[k] === 'object' && '$gte' in filter[k]) {
          const val = filter[k]['$gte'];
          if ((item[k] || 0) < val) return false;
          continue;
        }
        if (item[k] !== filter[k]) return false;
      }
      return true;
    });

    let doc;
    let isNew = false;
    if (idx >= 0) {
      doc = store[idx];
    } else if (options && options.upsert) {
      isNew = true;
      doc = { 
        _id: Math.random().toString(), 
        points: 0, 
        inventory: [], 
        linked: false, 
        createdAt: new Date() 
      };
      
      for (const k in filter) {
        if (filter[k] && typeof filter[k] !== 'object') {
          doc[k] = filter[k];
        }
      }
      store.push(doc);
      idx = store.length - 1;
    } else {
      console.log(`[MOCK DB] [findOneAndUpdate] no doc found, returning null`);
      return null;
    }

    if (update.$setOnInsert && isNew) {
      for (const k in update.$setOnInsert) {
        doc[k] = update.$setOnInsert[k];
      }
    }

    if (update.$inc) {
      for (const k in update.$inc) {
        doc[k] = (doc[k] || 0) + update.$inc[k];
      }
    }
    if (update.$push) {
      for (const k in update.$push) {
        doc[k] = doc[k] || [];
        doc[k].push(update.$push[k]);
      }
    }
    if (update.$set) {
      for (const k in update.$set) {
        doc[k] = update.$set[k];
      }
    }
    for (const k in update) {
      if (!k.startsWith('$')) {
        doc[k] = update[k];
      }
    }

    console.log(`[MOCK DB] [findOneAndUpdate] final doc points=${doc.points}`);
    return new mockModel(doc);
  };

  mockModel.deleteOne = async (query) => {
    const idx = store.findIndex(item => {
      for (const k in query) {
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
    if (idx >= 0) {
      store.splice(idx, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  };

  mockModel.countDocuments = async () => {
    return store.length;
  };

  mockModel.insertMany = async (arr) => {
    for (const item of arr) {
      store.push({ _id: Math.random().toString(), ...item });
    }
    return arr;
  };

  mockModel.updateOne = mockModel.findOneAndUpdate;

  modelsStore[name] = mockModel;
  return mockModel;
};

module.exports = mongoose;
