/**
 * WorkOS Fine-Grained Authorization (FGA) Demo Script
 * ------------------------------------------------
 * This script demonstrates document access control using WorkOS FGA.
 * It creates test users, teams, and documents, then validates access patterns
 * through both direct FGA checks and API endpoints.
 * 
 * Prerequisites:
 * - WorkOS API key configured in .env.local
 * - AWS credentials configured for CloudFormation access
 * - API Gateway stack deployed successfully
 * - JWT secret configured for API authentication
 */

import { WorkOS, WarrantOp } from '@workos-inc/node';
import * as dotenv from 'dotenv';
import { CloudFormation } from '@aws-sdk/client-cloudformation';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { fromIni } from '@aws-sdk/credential-providers';

// Load environment variables from .env.local file
// This keeps sensitive credentials out of the codebase
dotenv.config({ path: '.env.local' });

// Initialize WorkOS client with API key from environment variables
const workos = new WorkOS(process.env.WORKOS_API_KEY);

// Initialize AWS CloudFormation client
// fromIni loads AWS credentials from ~/.aws/credentials or ~/.aws/config
// This allows different AWS profiles to be used for different environments
const cloudformation = new CloudFormation({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: fromIni({
    profile: process.env.AWS_PROFILE || 'default'
  })
});

// JWT secret used for creating tokens that authenticate API requests
// In production, this should be a secure, randomly-generated value
const secret = process.env.JWT_SECRET || 'your-secret-key';

// Test data configuration
// These constants define the test entities we'll use throughout the demo
const TEST_DOCUMENTS = {
  ownerOnly: 'owner-only-doc.txt',  // Document accessible only to its owner
  teamShared: 'team-doc-1.txt',     // Document shared with entire team
};

const TEST_TEAMS = {
  engineering: 'engineering'         // Engineering team identifier
};

// Test users with emoji identifiers for clearer console output
const TEST_USERS = {
  alice: { id: 'alice', emoji: '👩' },    // Team member with document ownership
  bob: { id: 'bob', emoji: '👨' },        // Team member without document ownership
  charlie: { id: 'charlie', emoji: '🧑' }  // User outside the team
};

async function runDemo() {
  console.log('\n📚 WorkOS FGA Demo: Document Access Control\n');

  // Part 1: Test FGA rules directly through WorkOS API
  console.log('Part 1: Testing FGA Rules Directly\n');
  const writeResponse = await runFGATests();

  // Part 2: Test access through API Gateway endpoints
  // Uses the warrant token from Part 1 to maintain authorization context
  console.log('\nPart 2: Testing API Access\n');
  await runAPITests({ warrantToken: writeResponse.warrantToken });
}

async function runFGATests() {
  // Setup test environment by creating:
  // - Engineering team
  // - User memberships
  // - Document ownership and sharing rules
  console.log('🏗️  Setting up test environment...');
  console.log('├── Creating Engineering team');
  console.log('├── Adding test users:');
  console.log('│   ├── Alice (Engineering team member)');
  console.log('│   ├── Bob (Engineering team member)');
  console.log('│   └── Charlie (No team affiliations)');
  console.log('└── Creating test documents:');
  console.log('    ├── owner-only-doc.txt (owned by Alice)');
  console.log('    └── team-doc-1.txt (shared with Engineering team)');
  
  const writeResponse = await workos.fga.batchWriteWarrants([
    {
      op: WarrantOp.Create,
      resource: { resourceType: 'team', resourceId: 'engineering' },
      relation: 'member',
      subject: { resourceType: 'user', resourceId: 'alice' }
    },
    {
      op: WarrantOp.Create,
      resource: { resourceType: 'team', resourceId: 'engineering' },
      relation: 'member',
      subject: { resourceType: 'user', resourceId: 'bob' }
    },
    {
      op: WarrantOp.Create,
      resource: { resourceType: 'document', resourceId: 'owner-only-doc.txt' },
      relation: 'owner',
      subject: { resourceType: 'user', resourceId: 'alice' }
    },
    {
      op: WarrantOp.Create,
      resource: { resourceType: 'document', resourceId: 'team-doc-1.txt' },
      relation: 'parent',
      subject: { resourceType: 'team', resourceId: 'engineering' }
    }
  ]);

  console.log('🧪 Testing FGA Authorization Rules:\n');
  await runDirectTests();

  return writeResponse;
}

async function runDirectTests() {
  console.log('\n🔍 Direct FGA Authorization Checks:\n');
  
  const checks = [
    {
      desc: `${TEST_USERS.alice.emoji} Alice can view her own document`,
      check: {
        resource: { resourceType: 'document', resourceId: TEST_DOCUMENTS.ownerOnly },
        relation: 'viewer',
        subject: { resourceType: 'user', resourceId: TEST_USERS.alice.id }
      },
      expectAuthorized: true,
    },
    {
      desc: `${TEST_USERS.bob.emoji} Bob can view team document`,
      check: {
        resource: { resourceType: 'document', resourceId: TEST_DOCUMENTS.teamShared },
        relation: 'viewer',
        subject: { resourceType: 'user', resourceId: TEST_USERS.bob.id }
      },
      expectAuthorized: true,
    },
    {
      desc: `${TEST_USERS.charlie.emoji} Charlie cannot view Alice's document`,
      check: {
        resource: { resourceType: 'document', resourceId: TEST_DOCUMENTS.ownerOnly },
        relation: 'viewer',
        subject: { resourceType: 'user', resourceId: TEST_USERS.charlie.id }
      },
      expectAuthorized: false
    }
  ];

  for (const { desc, check, expectAuthorized = true } of checks) {
    const response = await workos.fga.check({ checks: [check] });
    const result = response.isAuthorized() === expectAuthorized;
    console.log(`   ${desc}: ${result ? '✅' : '❌'}`);
  }
}

async function runAPITests({ warrantToken }: { warrantToken: string }) {
  // Get the API Gateway URL from CloudFormation stack outputs
  console.log('🏗️  Getting API Gateway URL...');
  const { apiUrl } = await getStackOutputs();

  console.log('\n🔑 Testing document access through API:\n');

  // Define test scenarios that cover different access patterns
  const testCases = [
    {
      title: '1️⃣  Owner Access',
      scenario: `${TEST_USERS.alice.emoji} Alice accessing her personal document (${TEST_DOCUMENTS.ownerOnly})`,
      expectation: 'Access should be granted (Alice is owner)',
      user: TEST_USERS.alice.id,
      document: TEST_DOCUMENTS.ownerOnly,
      shouldSucceed: true
    },
    {
      title: '2️⃣  Team Access',
      scenario: `${TEST_USERS.bob.emoji} Bob accessing team document (${TEST_DOCUMENTS.teamShared})`,
      expectation: 'Access should be granted (Bob is team member)',
      user: TEST_USERS.bob.id,
      document: TEST_DOCUMENTS.teamShared,
      shouldSucceed: true
    },
    {
      title: '3️⃣  Testing Unauthorized Access',
      scenario: `${TEST_USERS.charlie.emoji} Charlie attempting to access protected document (${TEST_DOCUMENTS.ownerOnly})`,
      expectation: `${TEST_USERS.charlie.emoji} Charlie should be denied access as he is not authorized`,
      user: TEST_USERS.charlie.id,
      document: TEST_DOCUMENTS.ownerOnly,
      shouldSucceed: false
    }
  ];

  // Iterate through each test case to validate authorization patterns
  for (const test of testCases) {
    console.log(`\n${test.title}`);
    console.log(`   Scenario: ${test.scenario}`);
    console.log(`   Expectation: ${test.expectation}\n`);

    // Create a JWT token for user authentication
    // The token contains the user ID in the 'sub' claim, which the Lambda authorizer will extract
    console.log(`   🎟️  Creating JWT token for user: ${test.user}`);
    const token = jwt.sign({ sub: test.user }, secret);
    console.log(`   📝 Token payload:`, JSON.stringify({ sub: test.user }, null, 2));

    // Prepare the API request with both JWT (for user auth) and Warrant token (for FGA checks)
    // The Lambda authorizer will:
    // 1. Validate the JWT token
    // 2. Extract the user ID
    // 3. Use the Warrant token to check FGA permissions
    console.log(`\n   🌐 Making API request:`);
    console.log(`   └── URL: ${apiUrl}/documents/${test.document}`);
    console.log('   └── Headers:');
    console.log(`      ├── Authorization: Bearer ${token.substring(0, 20)}...`);
    console.log(`      └── Warrant-Token: ${warrantToken.substring(0, 20)}...`);

    try {
      // The request flows through API Gateway -> Lambda Authorizer -> Lambda Function
      // If authorization fails, the Lambda Authorizer will return a 403
      // If it succeeds, the Lambda Function will return the document content
      console.log('\n   ⏳ Awaiting response from Lambda authorizer...');
      const response = await axios.get(`${apiUrl}/documents/${test.document}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Warrant-Token': warrantToken
        }
      });

      // Handle successful API responses
      // For positive test cases (shouldSucceed = true), this is expected
      // For negative test cases, this indicates a potential security issue
      if (test.shouldSucceed) {
        console.log('   ✅ Authorization successful');
        console.log('   📨 Response details:');
        console.log(`   └── Status: ${response.status} ${response.statusText}`);
        console.log(`   └── Document content: "${response.data}"\n`);
      } else {
        console.log('   ❌ Unexpected success - authorization should have failed');
        console.log(`   └── Status: ${response.status} ${response.statusText}\n`);
      }
    } catch (error: any) {
      // Handle API errors (usually authorization failures)
      // Extract meaningful error messages from various possible response formats
      const errorMessage = error.response?.data?.Message || error.response?.data?.message || error.message;
      const statusCode = error.response?.status;
      
      // For negative test cases, a 403 response is expected and correct
      // For positive test cases, any error indicates a problem
      if (!test.shouldSucceed) {
        console.log('   ✅ Authorization correctly denied');
        console.log('   📨 Response details:');
        console.log(`   └── Status: ${statusCode}`);
        console.log(`   └── Error: ${JSON.stringify({ Message: errorMessage })}\n`);
      } else {
        console.log('   ❌ Unexpected authorization failure');
        console.log('   📨 Response details:');
        console.log(`   └── Status: ${statusCode}`);
        console.log(`   └── Error: ${errorMessage}\n`);
      }
    }
    
    // Visual separator between test cases for clearer output
    console.log('   ─────────────────────────────────────\n');
  }
}

/**
 * Retrieves the API Gateway URL from CloudFormation stack outputs
 * This URL is required to make requests to our deployed API
 * 
 * @throws {Error} If the API endpoint cannot be found in stack outputs
 * @returns {Promise<{apiUrl: string}>} The API Gateway endpoint URL
 */
async function getStackOutputs() {
  // Query CloudFormation for stack details
  const { Stacks } = await cloudformation.describeStacks({ 
    StackName: 'WorkOSFgaApiGatewayStack' 
  });
  
  // Extract all outputs from the stack
  const outputs = Stacks?.[0]?.Outputs || [];
  
  // Find the specific output containing our API endpoint
  const apiUrl = outputs.find(o => o.OutputKey?.includes('WorkOSFgaApiEndpoint'))?.OutputValue;
  if (!apiUrl) {
    throw new Error('API endpoint not found in stack outputs');
  }
  
  return { apiUrl };
}

runDemo().catch(console.error); 