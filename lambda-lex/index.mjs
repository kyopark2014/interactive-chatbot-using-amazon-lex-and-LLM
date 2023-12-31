import { LexRuntimeV2Client, RecognizeTextCommand} from "@aws-sdk/client-lex-runtime-v2"; 

export const handler = async (event) => {  
    console.log('## ENVIRONMENT VARIABLES: ' + JSON.stringify(process.env));
    console.log('## EVENT: ' + JSON.stringify(event));

    const text = event.text;
    const msgId = event.msgId;
    //let isCompleted = false;

    let lexParams = {        
        botAliasId: process.env.botAliasId,
        botId: process.env.botId,
        localeId: process.env.localeId,
        text: text,
        sessionId: process.env.sessionId,
    };
    
    const lexClient = new LexRuntimeV2Client();
    const command = new RecognizeTextCommand(lexParams);

    let response = "";
    try {
      const data = await lexClient.send(command);
      console.log("response: ", JSON.stringify(data));

      if(data['messages']) {
        response = {
          statusCode: 200,
          msg: data['messages'][0].content,
        };

        const expirationTime = Math.round(new Date().getTime()/1000 + 24*60*60); // 1 day
      }
      else {
        response = {
          statusCode: 408,
          body: JSON.stringify(data),          
        };
      }
    } catch (err) {
      console.log("Error responding to message. ", err);

      response = {
        statusCode: 500,
        body: JSON.stringify(err),          
      };
    }
    console.log('response: ', JSON.stringify(response));
    /*
    function wait() {
        return new Promise((resolve, reject) => {
            if (!isCompleted) {
                setTimeout(() => resolve("wait..."), 1000);
            }
            else {
                setTimeout(() => resolve("done..."), 0);
            }
        });
    }
    console.log(await wait());
    console.log(await wait());
    console.log(await wait());
    console.log(await wait());
    console.log(await wait());
    */
    return response;
};
