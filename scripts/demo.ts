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

dotenv.config({ path: '.env.local' });

const workos = new WorkOS(process.env.WORKOS_API_KEY);
const cloudformation = new CloudFormation({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: fromIni({
    profile: process.env.AWS_PROFILE || 'default'
  })
});
const secret = process.env.JWT_SECRET || 'your-secret-key';

// Test configuration for better organization
const TEST_DOCUMENTS = {
  ownerOnly: 'owner-only-doc.txt',
  teamShared: 'team-doc-1.txt',
  publicDoc: 'public-doc.txt'
};

const TEST_TEAMS = {
  engineering: 'engineering'
};

const TEST_USERS = {
  alice: { id: 'alice', emoji: '👩' },
  bob: { id: 'bob', emoji: '👨' },
  charlie: { id: 'charlie', emoji: '🧑' }
};

async function runDemo() {
  console.log('\n📚 WorkOS FGA Demo: Document Access Control\n');

  // Part 1: Direct FGA Tests
  console.log('Part 1: Testing FGA Rules Directly\n');
  const writeResponse = await runFGATests();

  // Part 2: Testing API Access
  console.log('\nPart 2: Testing API Access\n');
  await runAPITests({ warrantToken: writeResponse.warrantToken });
}

async function runFGATests() {
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
      resource: { resourceType: 'report', resourceId: 'owner-only-doc.txt' },
      relation: 'owner',
      subject: { resourceType: 'user', resourceId: 'alice' }
    },
    {
      op: WarrantOp.Create,
      resource: { resourceType: 'report', resourceId: 'team-doc-1.txt' },
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
        resource: { resourceType: 'report', resourceId: TEST_DOCUMENTS.ownerOnly },
        relation: 'viewer',
        subject: { resourceType: 'user', resourceId: TEST_USERS.alice.id }
      }
    },
    {
      desc: `${TEST_USERS.bob.emoji} Bob can view team document`,
      check: {
        resource: { resourceType: 'report', resourceId: TEST_DOCUMENTS.teamShared },
        relation: 'viewer',
        subject: { resourceType: 'user', resourceId: TEST_USERS.bob.id }
      }
    },
    {
      desc: `${TEST_USERS.charlie.emoji} Charlie cannot view Alice's document`,
      check: {
        resource: { resourceType: 'report', resourceId: TEST_DOCUMENTS.ownerOnly },
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
  console.log('🏗️  Getting API Gateway URL...');
  const { apiUrl } = await getStackOutputs();

  console.log('\n🔑 Testing document access through API:\n');

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

  for (const test of testCases) {
    console.log(`\n${test.title}`);
    console.log(`   Scenario: ${test.scenario}`);
    console.log(`   Expectation: ${test.expectation}\n`);

    const token = jwt.sign({ sub: test.user }, secret);

    try {
      const response = await axios.get(`${apiUrl}/documents/${test.document}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Warrant-Token': warrantToken
        }
      });

      if (test.shouldSucceed) {
        console.log('   ✅ Successfully accessed document');
        console.log(`   📄 Document content read from S3: "${response.data}"\n`);
      } else {
        console.log('   ❌ Unexpected success - should have been denied\n');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.Message || error.response?.data?.message || error.message;
      
      if (!test.shouldSucceed) {
        console.log('   ✅ Correctly denied access');
        console.log(`   🛡️  Error: ${JSON.stringify({ Message: errorMessage })}\n`);
      } else {
        console.log('   ❌ Failed to access document');
        console.log(`   🚫 Error: ${errorMessage}\n`);
      }
    }
  }
}

async function getStackOutputs() {
  const { Stacks } = await cloudformation.describeStacks({ StackName: 'WorkOSFgaApiGatewayStack' });
  const outputs = Stacks?.[0]?.Outputs || [];
  
  const apiUrl = outputs.find(o => o.OutputKey?.includes('WorkOSFgaApiEndpoint'))?.OutputValue;
  if (!apiUrl) {
    throw new Error('API endpoint not found in stack outputs');
  }
  
  return { apiUrl };
}

runDemo().catch(console.error); 