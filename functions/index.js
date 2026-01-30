const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// TODO: Migrate your routes from server.js here
app.get('/hello', (req, res) => {
  res.send('Hello from Firebase Functions!');
});

exports.api = functions.https.onRequest(app);
