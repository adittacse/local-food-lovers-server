const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const serviceAccount = require("./local-food-lovers-client-firebase-admin-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


app.use(cors());
app.use(express.json());

const verifyFireBaseToken = async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ message: "Unauthorized Access" });
    }

    const token = authorization.split(" ")[1];
    if (!token) {
        return res.status(401).send({ message: "Unauthorized Access" });
    }

    try {
        const userInfo = await admin.auth().verifyIdToken(token);
        req.token_email = userInfo.email;
        next();
    } catch {
        return res.status(401).send({ message: "Unauthorized Access" });
    }
}

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
        const reviewsCollection = db.collection("reviews");
        const favoritesCollection = db.collection("favorites");

        // user related api's
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

        // review related api's
        app.get("/reviews", async (req, res) => {
            const email = req.query.reviewerEmail;
            const query = {};
            if (email) {
                query.reviewerEmail = email;
            }
            const cursor = reviewsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get("/reviews/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await reviewsCollection.findOne(query);
            res.send(result);
        });

        app.post("/reviews", async (req, res) => {
            const newReview = req.body;
            const result = await reviewsCollection.insertOne(newReview);
            res.send(result);
        });

        // favorite related api's
        app.get("/favorites", verifyFireBaseToken, async (req, res) => {
            const email = req.query.reviewerEmail;
            const query = {};
            if (email) {
                query.reviewerEmail = email;
                if (email !== req.token_email) {
                    return res.status(403).send({ message: "Forbidden Access" });
                }
            }
            const cursor = favoritesCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.post("/favorites", async (req, res) => {
            const newFavorite = req.body;
            const result = await favoritesCollection.insertOne(newFavorite);
            res.send(result);
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