const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.DATABASE_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const eventCollection = client.db("eventDB").collection("events");
    const userCollection = client.db("eventDB").collection("users");
    const galleryCollection = client.db("eventDB").collection("gallery");

    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.DB_SECRET_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyToken = async (req, res, next) => {
      const authorization = await req.headers.authorization;
      if (!authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = authorization.split(" ")[1];
      if (token) {
        jwt.verify(token, process.env.DB_SECRET_TOKEN, (err, decoded) => {
          if (err) {
            return res.status(401).send({ message: "unauthorized access" });
          }
          req.decoded = decoded;
          next();
        });
      }
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.get("/user/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      // console.log(email);
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/events", verifyToken, verifyAdmin, async (req, res) => {
      const event = req.body;
      const result = await eventCollection.insertOne(event);
      res.send(result);
    });

    app.get("/events", async (req, res) => {
      const result = await eventCollection.find().toArray();
      res.send(result);
    });

    app.get("/events/:id", verifyToken,  async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      console.log(query);
      const result = await eventCollection.findOne(query);
      res.send(result);
    });

    app.get("/event/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await eventCollection.findOne(query);
      res.send(result);
    });

    app.delete("/event/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await eventCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/events/:id", verifyToken, verifyAdmin, async (req, res) => {
      const data = req.body;
      const eventId = req.params.id;
      const filter = { _id: new ObjectId(eventId) };
      const updatedDoc = {
        $set: {
          title: data.title,
          description: data.description,
          date: data.date,
          location: data.location,
          eventTime: data.eventTime,
          status: data.status,
          category: data.category,
        },
      };
      const result = await eventCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const isExistEmail = await userCollection.findOne(query);
      if (isExistEmail) {
        return res.send({
          message: "email is already exist",
          insertedId: null,
        });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.delete("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    app.patch(
      "/user/make-admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedAdmin = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedAdmin);
        res.send(result);
      }
    );

    app.post("/gallery", verifyToken, verifyAdmin, async (req, res) => {
      const eventGallery = req.body;
      const result = await galleryCollection.insertOne(eventGallery);
      res.send(result);
    });

    app.get("/gallery", async (req, res) => {
      const result = await galleryCollection.find().toArray();
      res.send(result);
    });

    app.get("/gallery/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await galleryCollection.findOne(query);
      res.send(result);
    });

    app.delete("/gallery/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await galleryCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/gallery-search", async (req, res) => {
      try {
        const { title, year } = req.query;
        const query = {};

        if (title) {
          query.title = { $regex: title, $options: "i" }; // Case-insensitive title search
        }

        if (year) {
          query.year = year; // Filter by year (corrected here)
        }

        // Fetch unique years for the dropdown filter
        const eventInfo = await eventCollection
          .find({}, { projection: { year: 1 } })
          .toArray();

        // Filter events based on query
        const result = await galleryCollection.find(query).toArray();
        const years = [...new Set(eventInfo.map((event) => event.year))];
        res.send({ result, years });
      } catch (error) {
        console.error(error.name, error.message);
        res
          .status(500)
          .send({ message: "An error occurred while fetching the gallery." });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send(`running`);
});

app.listen(port, (req, res) => {
  console.log(`on port: ${port}`);
});
