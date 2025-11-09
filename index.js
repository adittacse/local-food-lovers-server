const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.gkaujxr.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const db = client.db("localFoodLovers");
        const usersCollection = db.collection("users");

        app.post("/users", async (req, res) => {
            const newUser = req.body;
            email = newUser.email;
            const query = { email: email };
            const existingUser = await usersCollection.findOne(query);
            
            if (existingUser) {
                res.send({ message: "User already exists." });
            } else {
                const result = await usersCollection.insertOne(newUser);
                res.send(result);
            }
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Local Food Lovers server side is running!");
});

app.listen(port, () => {
    console.log(`Local Food Lovers listening on ${process.env.PROTOCOL}://${process.env.HOST}:${process.env.PORT}`);
});