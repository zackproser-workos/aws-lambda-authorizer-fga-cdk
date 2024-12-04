import { WorkOS, WarrantOp } from '@workos-inc/node';
import * as dotenv from 'dotenv';
import { CloudFormation } from '@aws-sdk/client-cloudformation';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { fromIni } from '@aws-sdk/credential-providers';

dotenv.config({ path: '.env.local' });

const cloudformation = new CloudFormation({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: fromIni({
    profile: process.env.AWS_PROFILE || 'default'
  })
});

async function testAwsAuth() {
  console.log('🔑 Testing AWS Authentication...');
  
  try {
    const { StackSummaries } = await cloudformation.listStacks({});
    console.log('✅ AWS Authentication successful');
    
    const workosStacks = StackSummaries?.filter(s => s.StackName && s.StackName.startsWith('WorkOS')) || [];
    console.log('\n📚 Found WorkOS Stacks:');
    workosStacks.forEach(stack => {
      console.log(`   • ${stack.StackName}`);
    });

    console.log('\n🔍 Checking WorkOS FGA stack outputs...');
    const { Stacks } = await cloudformation.describeStacks({ 
      StackName: 'WorkOSFgaApiGatewayStack'
    });
    
    const outputs = Stacks?.[0]?.Outputs || [];
    const apiUrl = outputs.find(o => o.OutputKey === 'WorkOSFgaApiEndpointA2DC3F80')?.OutputValue;
    if (!apiUrl) {
      throw new Error('API endpoint not found in stack outputs');
    }

    console.log('📝 Stack outputs:');
    outputs.forEach(output => {
      console.log(`   ${output.OutputKey}: ${output.OutputValue}`);
    });

    await testApiEndpoint(apiUrl);

  } catch (error) {
    console.error('❌ AWS Authentication failed:', error);
    throw error;
  }
}

async function testApiEndpoint(apiUrl: string) {
  console.log('\n🌐 Testing API endpoint with JWT...');
  
  const token = jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET || 'your-secret-key');
  
  try {
    const response = await axios.get(`${apiUrl}/documents/test-doc`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('✅ Successfully accessed document:', response.data);
  } catch (error: any) {
    console.error('❌ Failed to access document:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
  }
}

testAwsAuth().catch(console.error);

/*
// Original demo code below
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
  // ... rest of original code ...
}

async function runAPITests({ warrantToken }: { warrantToken: string }) {
  // ... rest of original code ...
}

async function getStackOutputs() {
  // ... rest of original code ...
}

// runDemo().catch(console.error);
*/ 