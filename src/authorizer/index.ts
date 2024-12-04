import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { WorkOS } from '@workos-inc/node';
import * as jwt from 'jsonwebtoken';

const workos = new WorkOS(process.env.WORKOS_API_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function getUserIdFromToken(token: string): string {
  if (!token.startsWith('Bearer ')) {
    throw new Error('Invalid token format');
  }
  const tokenString = token.split(' ')[1];
  const decoded = jwt.verify(tokenString, JWT_SECRET) as { sub: string };
  console.log('🔍 Decoded token:', decoded);
  return decoded.sub;
}

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  try {
    console.log('🔑 Authorization event received');
    console.log('Event details:', JSON.stringify(event, null, 2));

    const token = event.authorizationToken;
    const documentId = event.methodArn.split(':').pop()?.split('/').pop();
    if (!documentId) {
      throw new Error('Could not extract document ID from request');
    }

    const userId = getUserIdFromToken(token);
    console.log(`🔍 Checking if 👤 User ID: ${userId} can access 📄 Document ID: ${documentId}`);

    const checkResponse = await workos.fga.check({
      checks: [{
        resource: { 
          resourceType: 'report',
          resourceId: documentId 
        },
        relation: 'viewer',
        subject: {
          resourceType: 'user',
          resourceId: userId
        }
      }]
    });

    console.log('✅ FGA check response:', checkResponse);

    return {
      principalId: userId,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: checkResponse.isAuthorized() ? 'Allow' : 'Deny',
            Resource: event.methodArn,
          },
        ],
      },
    };
  } catch (error) {
    console.error('❌ Authorization error:', (error as Error).message);
    throw new Error('Unauthorized');
  }
}; 