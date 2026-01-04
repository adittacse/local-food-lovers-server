const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const serviceAccount = require("./local-food-lovers-client-firebase-admin-key.json");
// const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
// const serviceAccount = JSON.parse(decoded);

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
        // await client.connect();
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
            const { reviewerEmail, foodName, search, location, minRating, sort="newest" } = req.query;
            const query = {};
            if (reviewerEmail) {
                query.reviewerEmail = reviewerEmail;
            }

            if (foodName) {
                const esc = foodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                query.foodName = { $regex: esc, $options: "i" };
            }
            
            if (search) {
                query.$or = [
                    { foodName: { $regex: search, $options: "i" } },
                    { restaurantName: { $regex: search, $options: "i" } }
                ];
            }

            if (location) {
                query.location = location;
            }

            if (minRating) {
                query.rating = {
                    $gte: parseFloat(minRating)
                };
            }

            let sortQuery = {};
            switch (sort) {
                case "rating_high":
                    sortQuery = { rating: -1 };
                    break;
                case "rating_low":
                    sortQuery = { rating: 1 };
                    break;
                case "oldest":
                    sortQuery = { date: 1 };
                    break;
                default:
                    sortQuery = { date: -1 }; // newest
            }

            const cursor = reviewsCollection.find(query).sort(sortQuery);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get("/reviews/featured", async (req, res) => {
            const cursor = reviewsCollection.find().sort({ rating: -1 }).limit(6);
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

        app.patch("/reviews/:id", verifyFireBaseToken, async (req, res) => {
            const id = req.params.id;
            const updatedReview = req.body;
            const email = req.body.reviewerEmail;
            if (email !== req.token_email) {
                return res.status(403).send({ message: "Forbidden Access" });
            }
            const query = { _id: new ObjectId(id) };
            const update = {
                $set: updatedReview
            };
            const options = {};
            const result = await reviewsCollection.updateOne(query, update, options);
            res.send(result);
        });

        app.delete("/reviews/:id", async (req, res) => {
            const id = req.params.id;
            const query1 = { reviewId: id };
            const cursor = favoritesCollection.find(query1);
            const existsInFavorite = await cursor.toArray();
            if (existsInFavorite.length > 0) {
                await favoritesCollection.deleteMany(query1);
            }

            const query2 = { _id: new ObjectId(id) };
            const result = await reviewsCollection.deleteOne(query2);
            res.send(result);
        });

        // favorite related api's
        app.get("/favorites", verifyFireBaseToken, async (req, res) => {
            const email = req.query.favoriteUserEmail;
            const query = {};
            if (email) {
                query.favoriteUserEmail = email;
                if (email !== req.token_email) {
                    return res.status(403).send({ message: "Forbidden Access" });
                }
            }
            
            const favoritesResult = await favoritesCollection.find(query).toArray();
            const ids = favoritesResult.map(f => f.reviewId).map(id => new ObjectId(id));

            const reviewsResult = reviewsCollection.find({ _id: { $in: ids} })
            const result = await reviewsResult.toArray();
            res.send(result);
        });

        app.get("/favorites/exists", verifyFireBaseToken, async (req, res) => {
            const { reviewId } = req.query;
            if (!reviewId) {
                return res.status(400).json({ ok: false });
            }
            const exists = await favoritesCollection.findOne({
                reviewId,
                favoriteUserEmail: req.token_email
            });
            res.send(exists);
        });

        app.post("/favorites", verifyFireBaseToken, async (req, res) => {
            const id = req.body.reviewId;
            const newFavorite = req.body;
            const query = {
                reviewId: id,
                favoriteUserEmail: req.token_email
            };
            const exists = await favoritesCollection.findOne(query);
            if (exists) {
                return res.json({ duplicated: true, message: "Already in favorite" });
            }
            const result = await favoritesCollection.insertOne(newFavorite);
            res.send(result);
        });

        app.delete("/favorites/:id", async (req, res) => {
            const id = req.params.id;
            const query = { reviewId: id };
            const result = await favoritesCollection.deleteOne(query);
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