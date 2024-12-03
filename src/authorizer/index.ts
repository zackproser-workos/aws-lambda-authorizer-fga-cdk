import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  // This is a placeholder implementation
  // You'll need to implement the actual WorkOS FGA check here
  try {
    const token = event.authorizationToken;
    
    // TODO: Implement WorkOS FGA check
    const isAuthorized = true; // Replace with actual authorization logic
    
    return {
      principalId: 'user',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: isAuthorized ? 'Allow' : 'Deny',
            Resource: event.methodArn,
          },
        ],
      },
    };
  } catch (error) {
    console.error('Authorization error:', error);
    throw new Error('Unauthorized');
  }
}; 