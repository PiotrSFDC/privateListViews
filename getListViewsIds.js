const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');
const fsPromise = require('fs').promises;
const csv = require('csvtojson');
require('dotenv').config();

const csvFilePath = './input/users.csv';
const csvExcludedLVPath = './input/excludedListViews.csv'
const resultsPath = './output/results.csv';
const outputPath = './output/listviews.csv';
const privateKey = fs.readFileSync('./crt/domain.key');

// Get env variables
const clientId = process.env.CLIENT_ID;
const loginUrl = process.env.INSTANCE_URL;
const sobjects = process.env.SOBJECTS;

const liSObjects= sobjects.split(',');
const strObjects='\'' + sobjects.replace(',','\',\'') + '\''; 
console.log(strObjects);

// Function to convert CSV to JSON
async function writeFile(filePath, data) {
	await fsPromise.writeFile(filePath, data);
}

// Function to convert CSV to JSON
async function csvToJSONByUser(csvFilePath) {
	// Convert CSV to JSON using a stream
	const jsonData = await csv().fromFile(csvFilePath);

	const groupedByUsername = jsonData.reduce((acc, item) => {
		let userGroup = acc.find(group => group.user === item.username);
		if (!userGroup) {
			userGroup = { user: item.username, data: [] };
			acc.push(userGroup);
		}
		userGroup.data.push(item);
		return acc;
	}, []);

	return groupedByUsername;
}

// Function to convert CSV to JSON
async function csvToJSON(csvFilePath) {
	// Convert CSV to JSON using a stream
	const jsonData = await csv().fromFile(csvFilePath);

	/*
	const groupedByUsername = jsonData.reduce((acc, item) => {
		let userGroup = acc.find(group => group.user === item.username);
		if (!userGroup) {
			userGroup = { user: item.username, data: [] };
			acc.push(userGroup);
		}
		userGroup.data.push(item);
		return acc;
	}, []);

	return groupedByUsername;
	*/
	return jsonData;
}

// move reports folder
/*
async function patchSalesforceReport(reportId, folderId, authInfo) {
    const accessToken = authInfo.accessToken;
    const instanceUrl = authInfo.instanceUrl;
    const apiEndpoint = `${instanceUrl}/services/data/v58.0/analytics/reports/${reportId}`; // Replace vXX.X with your API version
  
    const data = {
        reportMetadata: {
          folderId: folderId
        }
      };
    
      try {
        const response = await axios.patch(apiEndpoint, data, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
    
        //console.log('PATCH request successful:', response.data);
        return response.data;
      } catch (error) {
        console.error('Error making PATCH request:', error.response ? error.response.data : error.message);
        throw error;
      }
}
*/
// Function to query List Views object
async function queryListViews(instanceUrl, accessToken, username) {
	const queryUrl = instanceUrl + '/services/data/v52.0/query';
	// get quotes for query
	const strSobjects = sobjects.split(',').map(item => `'${item}'`).join(',');

	const queryString = 'SELECT DeveloperName,Id,SobjectType,LastModifiedDate,LastReferencedDate,LastViewedDate FROM ListView WHERE SobjectType in (' + strSobjects + ') AND CREATEDBY.USERNAME=\'' + username + '\'';
	console.log(queryString);
	const response = await axios.get(
	queryUrl, 
	{
		params: {
		q: queryString
		},
		headers: {
		Authorization: `Bearer ${accessToken}`
		}
	}
	);
	return response.data;
    
}

const requestAccessToken = async (token) => {
	try {
		const response = await axios.post(loginUrl + '/services/oauth2/token', null, {
			params: {
				grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
				assertion: token
			}
		});
		return response.data;
	} catch (error) {
		console.log('Error: ', error.stack);
		console.error('Error requesting access token:', error.response.data);
		throw error;
	}
};

async function getAccessToken(username) {
	// Create JWT token
	const token = jwt.sign(
		{
			iss: clientId, // Consumer Key from Salesforce Connected App
			sub: username, // Salesforce username
			aud: loginUrl, // Login URL
			exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // Token expiration time (24 hour from now)
		},
		privateKey,
		{ algorithm: 'RS256' }
	);
	const userInfo = await requestAccessToken(token);
	const result = {
		username: username,
		accessToken: userInfo.access_token,
		instanceUrl: userInfo.instance_url,
		loginUrl: loginUrl
	};
	return result;
}

// check if value exists in list (used to exlude listviews ids)
function recordExists(list, key, value) {
	return list.some(record => record[key] === value);
}
// Usage
const main = async () => {
	let results = []; 
	let retCsv = []; 
	const jsonData = await csvToJSONByUser(csvFilePath);
	const jsonExcluded = await csvToJSON(csvExcludedLVPath);
	console.log('jsonExcluded');
	console.log(jsonExcluded);
	console.log(JSON.stringify(jsonData, null, '\t'));
	results.push('username,count,status');

	for (const obj of jsonData) {
		let resultLine = obj.user;
		try {
			authInfo = await getAccessToken(obj.user);
			console.log('Logged as users: ' +authInfo.username);
		} catch (error) {
			console.log('Unable to Login', error.stack);
			resultLine = obj.user + ',Unable to Login';
			results.push(resultLine);
			continue;
		}

		//  main loop
		for (const d of obj.data) {
			try {
				const results = await queryListViews(authInfo.instanceUrl, authInfo.accessToken, authInfo.username);
				//console.log(results);
				let i = 0;
				for (const objRes of results.records){
					if (!recordExists(jsonExcluded, 'Id', objRes.Id)){
						retCsv.push(authInfo.username + ',' + objRes.SobjectType + ',' +objRes.Id);
						i++;
					}
				}
				resultLine = obj.user + ',' + i + ',OK';
			} catch (error) {
				console.log('Unable to , Error: ', error.stack);
				resultLine = obj.user + ',,' + error.message;			
			}
			results.push(resultLine);
		}

		
	}

	await writeFile(resultsPath, results.join('\r\n'));
	await writeFile(outputPath, retCsv.join('\r\n'));
	console.log('============END============');
};

main().catch((err) => {
	console.error('Error in main execution:', err.stack);
});