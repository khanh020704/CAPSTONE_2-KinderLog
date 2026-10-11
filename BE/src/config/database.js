import mongoose from 'mongoose'

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017'
// Set explicitly: a connection string without a database name would otherwise use "test".
const dbName = process.env.MONGODB_DB || 'kinderlog'

export function connectDatabase() {
  // Collections and indexes are created by the migrations, not on every start.
  return mongoose.connect(uri, { dbName, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 })
}

export function disconnectDatabase() {
  return mongoose.disconnect()
}

export const isDatabaseConnected = () => mongoose.connection.readyState === 1
