import json
import boto3
import os
import time
import datetime
import csv
import sys

from langchain import PromptTemplate, SagemakerEndpoint
from langchain.llms.sagemaker_endpoint import LLMContentHandler

endpoint_name = os.environ.get('endpoint_name')

class ContentHandler(LLMContentHandler):
    content_type = "application/json"
    accepts = "application/json"

    def transform_input(self, prompt: str, model_kwargs: dict) -> bytes:
        input_str = json.dumps({
            "text" : prompt, **model_kwargs
        })
        return input_str.encode('utf-8')
      
    def transform_output(self, output: bytes) -> str:
        response_json = json.loads(output.read().decode("utf-8"))
        return response_json["result"][0]

content_handler = ContentHandler()
aws_region = boto3.Session().region_name
client = boto3.client("sagemaker-runtime")
parameters = {
    "request_output_len": 512,
    "repetition_penalty": 1.1,
    "temperature": 0.9,
    "top_k": 50,
    "top_p": 0.9
} 

llm = SagemakerEndpoint(
    endpoint_name = endpoint_name, 
    region_name = aws_region, 
    model_kwargs = parameters,
    endpoint_kwargs={"CustomAttributes": "accept_eula=true"},
    content_handler = content_handler
)
              
def lambda_handler(event, context):
    print(event)
    userId  = event['user-id']
    print('userId: ', userId)
    requestId  = event['request-id']
    print('requestId: ', requestId)
    type  = event['type']
    print('type: ', type)
    body = event['body']
    print('body: ', body)

    start = int(time.time())    

    msg = ""
    
    if type == 'text':
        text = body
        
        answer = llm(text)
        print('answer: ', answer)

        pos = answer.rfind('### Assistant:\n')+15
        msg = answer[pos:]    
                                    
    elapsed_time = int(time.time()) - start
    print("total run time(sec): ", elapsed_time)

    print('msg: ', msg)

    return {
        'statusCode': 200,
        'msg': msg,
    }
