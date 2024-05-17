const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config({ path: path.resolve(__dirname, '.env') }) 
const {MONGO_DB_USERNAME, MONGO_DB_PASSWORD, MONGO_DB_NAME, MONGO_COLLECTION} = process.env;

const app = express();
const portNumber = process.env.PORT || 8000;
app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");

const uri = `mongodb+srv://${MONGO_DB_USERNAME}:${MONGO_DB_PASSWORD}@cluster0.nhkfh4u.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const databaseAndCollection = {db: MONGO_DB_NAME, collection:MONGO_COLLECTION};

const { MongoClient } = require('mongodb');


async function addDriver(client, databaseAndCollection, driver, drivers) {
    const existingDriver = await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).findOne({driverId:driver.driverId});
    if(!existingDriver) {
        await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).insertOne(driver);
        if (drivers.some(existingDriver => driver.driverId === existingDriver.driverId)) {
            driverList.push(driver);
        }
    }
}

async function removeDrivers(databaseAndCollection) {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).deleteMany({});
    } catch (e) {
        console.error(e);
        response.status(500)
        response.send("internal server error")
    } finally {
        await client.close();
    }
}

async function getDriverTable(client, databaseAndCollection, drivers) {
    let tableHTML = '<table border=1><thead><tr><th>Name</th><th>Nationality</th><th>DOB</th></tr></thead><tbody>';

    drivers.forEach(driver => {
        tableHTML += `<tr><td>${driver.givenName} ${driver.familyName}</td><td>${driver.nationality}</td><td>
        ${driver.dateOfBirth}</td></tr>`;
    });
    tableHTML += '</tbody></table>';
    return tableHTML;
}

if (process.argv.length != 2) {
    process.exit(1);
}

let prompt = "Stop to shutdown the server: ";
let exitMessage = "Shutting down the server";
let driverList = [];

process.stdin.on("readable", function () {
    let input = process.stdin.read();
    if (input !== null) {
        let option = String(input).trim();
        if (option == "stop") {
            process.stdout.write(exitMessage);
            removeDrivers(databaseAndCollection)
            .then (() => {
                process.exit(0);
            })
            .catch ((e) => {
                console.error(e);
                response.status(500)
                response.send("internal server error")
            });
        } else {
            process.stdout.write(`Invalid command: ${option} \n`);
        }
        process.stdin.resume();
    }
});
app.use(bodyParser.urlencoded({extended:false}));

app.get("/", async(request, response) => {
    response.render("index");
});

app.get("/newDriver", (request, response) => {
    const variables = {portNumber : portNumber}
    response.render("driverCreate", variables);
});

app.get("/nationality", (request, response) => {
    const variables = {portNumber : portNumber}
    response.render("nationality", variables);
});

app.get("/driverSearch", (request, response) => {
    const variables = {portNumber : portNumber}
    response.render("driverSearch", variables);
});

app.get("/drivers", async (request, response) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        
        let cursor = client.db(databaseAndCollection.db)
        .collection(databaseAndCollection.collection).find();
    
        const drivers = await cursor.toArray();

        let driverTable = await getDriverTable(client, databaseAndCollection, drivers);

        const variables = {
            table : driverTable 
        };
        
        response.render("driverTable", variables);
    } catch (e) {
        console.error(e);
        response.status(500)
        response.send("internal server error")
    } finally {
        await client.close();
    }
});

app.get("/driverRemove", (request, response) => {
    const variables = {portNumber : portNumber}
    response.render("removeDriver", variables);
});

app.post("/processNationality", async (request, response) => {
    const nationality = request.body;
    let curr = nationality;
    const client = new MongoClient(uri);
    try {
        await client.connect();
        
        let cursor = client.db(databaseAndCollection.db)
        .collection(databaseAndCollection.collection).find(curr);
    
        const drivers = await cursor.toArray();

        if (drivers.length == 0) {
            response.render("driverSearchNone");
            return;
        }

        table = await getDriverTable(client, databaseAndCollection, drivers)
        let variable = {table: table}
        if (!variable) {
            response.status(404)
            response.send("application not found")
        }
        response.render("nationalityConfirmation", variable);
    } catch (e) {
        console.error(e);
        response.status(500)
        response.send("internal server error")
    } finally {
        await client.close();
    }
});

app.post("/processDriverSearch", async (request, response) => {
    const driver = request.body.driverName;
    const curr = driver
    const [firstName, ...lastNameParts] = curr.split(" ");
    const lastName = lastNameParts.join(" ");

    const client = new MongoClient(uri);
    try {
        await client.connect();
       
        const query = {
            $and: [
                { givenName: firstName },
                { familyName: lastName }
            ]
        };

        const cursor = client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).find(query);
    
        const drivers = await cursor.toArray();

        if (drivers.length == 0) {
            response.render("driverSearchNone");
            return;
        }

        const table = await getDriverTable(client, databaseAndCollection, drivers);
        const variable = { table };

        if (!variable) {
            response.status(404);
            response.send("Driver not found");
        } else {
            response.render("driverSearchConfirmation", variable);
        }
    } catch (e) {
        console.error(e);
        response.status(500)
        response.send("internal server error")
    } finally {
        await client.close();
    }
});

app.post("/processNewDriver", async (request, response) => {
    const { firstName, lastName, nationality, dob, driverId, driverNum, backInfo } = request.body;
    const variables = {
        driverId: driverId,
        permanentNumber : driverNum,
        givenName : firstName,
        familyName : lastName,
        nationality : nationality,
        dateOfBirth : dob
    };
    const client = new MongoClient(uri);

    try {
        await client.connect();
        
        await addDriver(client, databaseAndCollection, variables, driverList)
        variables['backInfo'] = backInfo;
        response.render("driverCreateConfirmation", variables);
    } catch (e) {
        console.error(e);
        response.status(500)
        response.send("internal server error")
    } finally {
        await client.close();
    }
});

app.post("/processDriverRemove", async (request, response) => {
    const client = new MongoClient(uri);
    try {
        await client.connect();

        const result = await client.db(databaseAndCollection.db)
        .collection(databaseAndCollection.collection)
        .deleteMany({ driverId: { $nin: driverList.map(driver => driver.driverId) } });

        const variables = {number : result.deletedCount}
        response.render("removeDriverConfirmation", variables);
    } catch (e) {
        console.error(e);
        response.status(500)
        response.send("internal server error")
    } finally {
        await client.close();
    }
});

app.listen(portNumber, async() => {
    console.log(`Web server started and running at http://localhost:${portNumber}`);
    console.log('Waiting for database to load...')
    const client = new MongoClient(uri);
    try {
        await client.connect();
        for (let i = 10; i <= 24; i++) {
            const res = await fetch(`https://ergast.com/api/f1/20${i}/drivers.json`);
            const data = await res.json(); 
            const drivers = data.MRData.DriverTable.Drivers;

            for (const driver of drivers) {
                await addDriver(client, databaseAndCollection, driver, drivers);
            }
        }
    } catch (e) {
        console.error(e);
        response.status(500)
        response.send("internal server error")
    } finally {
        await client.close();
    }
    console.log(prompt);
});
