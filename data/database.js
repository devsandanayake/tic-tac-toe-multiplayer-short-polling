//imports built-in
//...

//imports 3rd party
const MongoClient = require("mongodb").MongoClient;

//imports custom
//...

//this variable will give access to the mongodb database
let database;

//environment variable for the database URL
let mongodbUrl = "mongodb+srv://dev:1234@mernapp.zwstxds.mongodb.net/?retryWrites=true&w=majority&appName=mernApp";
if (process.env.MONGODB_URL) {
  mongodbUrl = process.env.MONGODB_URL;
}

async function connect() {
  //connect to DB server and get access to it
  const client = await MongoClient.connect(mongodbUrl);
  //get access to specific database hosted in the DB server, even if it does not exist yet (it
  //will be created with first queries)
  database = client.db("tic-tac-toe");
}

function getDb() {
  if (!database) {
    throw { message: "Database connection not established!" };
  }
  return database;
}

module.exports = {
  connectToDatabase: connect,
  getDb: getDb,
};
