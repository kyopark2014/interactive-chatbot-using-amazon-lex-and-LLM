import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudFront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

const debug = false;
const stage = 'dev';

const endpoint_llm = 'jumpstart-dft-meta-textgeneration-llama-2-7b-f';
const projectName = "chatbot-using-lex-varico";
const botId = "BSZQXD0ABN";

export class CdkInteractiveChatbotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // s3 
    const s3Bucket = new s3.Bucket(this, `storage-for-${projectName}`,{
      // bucketName: bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      versioned: false,
    });
    if(debug) {
      new cdk.CfnOutput(this, 'bucketName', {
        value: s3Bucket.bucketName,
        description: 'The nmae of bucket',
      });
      new cdk.CfnOutput(this, 's3Arn', {
        value: s3Bucket.bucketArn,
        description: 'The arn of s3',
      });
      new cdk.CfnOutput(this, 's3Path', {
        value: 's3://'+s3Bucket.bucketName,
        description: 'The path of s3',
      });
    }

    // copy web application files into s3 bucket
    new s3Deploy.BucketDeployment(this, `upload-HTML-for-${projectName}`, {
      sources: [s3Deploy.Source.asset("../html")],
      destinationBucket: s3Bucket,
    });

    // cloudfront
    const distribution = new cloudFront.Distribution(this, `cloudfront-for-${projectName}`, {
      defaultBehavior: {
        origin: new origins.S3Origin(s3Bucket),
        allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
        viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      priceClass: cloudFront.PriceClass.PRICE_CLASS_200,  
    });
    new cdk.CfnOutput(this, 'distributionDomainName', {
      value: distribution.domainName,
      description: 'The domain name of the Distribution',
    });

    // Lambda for lex
    const lambdaLex = new lambda.Function(this, `lambda-lex-for-${projectName}`, {
      description: 'lambda for chat',
      functionName: `lambda-lex-for-${projectName}`,
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda-lex')),
      timeout: cdk.Duration.seconds(120),
      environment: {
        botId: botId,
        botAliasId: "TSTALIASID",
        localeId: "ko_KR", // en_US
        sessionId: "mysession-01",
      }
    });     
    const lexPolicy = new iam.PolicyStatement({  
      actions: ['lex:*'],
      resources: ['*'],
    });
    lambdaLex.role?.attachInlinePolicy(
      new iam.Policy(this, `lex-policy-for-${projectName}`, {
        statements: [lexPolicy],
      }),
    );    
    lambdaLex.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));  // permission for api Gateway
    
    // role for api gw
    const role = new iam.Role(this, `api-role-chatbot-for-${projectName}`, {
      roleName: `api-role-chatbot-for-${projectName}`,
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com")
    });
    role.addToPolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: ['lambda:InvokeFunction']
    }));
    role.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/AWSLambdaExecute',
    }); 
    
    // API Gateway
    const api = new apiGateway.RestApi(this, `api-chatbot-for-${projectName}`, {
      description: 'API Gateway for chatbot',
      endpointTypes: [apiGateway.EndpointType.REGIONAL],
      deployOptions: {
        stageName: stage,

        // logging for debug
        // loggingLevel: apiGateway.MethodLoggingLevel.INFO, 
        // dataTraceEnabled: true,
      },
    });  

    // POST method
    const chat = api.root.addResource('chat');
    chat.addMethod('POST', new apiGateway.LambdaIntegration(lambdaLex, {
      passthroughBehavior: apiGateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
      credentialsRole: role,
      integrationResponses: [{
        statusCode: '200',
      }], 
      proxy:false, 
    }), {
      methodResponses: [   // API Gateway sends to the client that called a method.
        {
          statusCode: '200',
          responseModels: {
            'application/json': apiGateway.Model.EMPTY_MODEL,
          }, 
        }
      ]
    }); 

    // cloudfront setting for api gateway of stable diffusion
    distribution.addBehavior("/chat", new origins.RestApiOrigin(api), {
      cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
      allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,  
      viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });    
    
    new cdk.CfnOutput(this, `WebUrl-for-${projectName}`, {
      value: 'https://'+distribution.domainName+'/chat.html',      
      description: 'The web url of request for chat',
    });

    new cdk.CfnOutput(this, `UpdateCommend-for-${projectName}`, {
      value: 'aws s3 cp ../html/chat.js '+'s3://'+s3Bucket.bucketName,
      description: 'The url of web file upload',
    });

    // role of lambda - varico
    const roleLambda = new iam.Role(this, `role-lambda-varico-for-${projectName}`, {
      roleName: `role-lambda-varico-for-${projectName}`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("lambda.amazonaws.com"),
      )
    });
    roleLambda.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    });

    // Lambda for chat using langchain (container)
    const lambdaVaricoApi = new lambda.DockerImageFunction(this, `lambda-varico-for-${projectName}`, {
      description: 'lambda for varico api',
      functionName: `lambda-varico-api-for-${projectName}`,
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../lambda-varico')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 4096,
      role: roleLambda,
      environment: {
        endpoint_llm: endpoint_llm,
      }
    });     
    lambdaVaricoApi.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));  
  }
}