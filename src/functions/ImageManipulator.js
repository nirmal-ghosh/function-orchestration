const { app } = require('@azure/functions');
const df = require('durable-functions');

const sharp = require('sharp');
const fs = require('fs')

const activityName = 'ImageManipulator';

df.app.orchestration('ImageManipulatorOrchestrator', function* (context) {
    const outputs = [];
    // Extract image data from the orchestrator input

    const imageData = context.df.getInput();

    // Call the activity functions with the image data
    outputs.push(yield context.df.callActivity('resizeImage', imageData));
    outputs.push(yield context.df.callActivity('grayScale', outputs[0]));
    outputs.push(yield context.df.callActivity('waterMark', outputs[1]));

    
    return outputs[1];
});

// Define activity functions
df.app.activity(activityName, {
    handler: (input) => {
        return `Hello, ${input}`;
    },
});

df.app.activity('resizeImage', {
    handler :  async (context ,inputImage) => {
        
        try {

            let parts = context.image.split(';');
            let mimType = parts[0].split(':')[1];

            const uri = context.image.split(';base64,').pop()

            // Resize the input image to a standard size (e.g., 1024x768 pixels).
            let imgBuffer = Buffer.from(uri, 'base64');
            const resizedImageBuffer = await sharp(imgBuffer).resize(1280, 720).toBuffer();            
            
            return `data:${mimType};base64,${resizedImageBuffer.toString('base64')}`;
        } catch (error) {
            console.log(error);
            // context.log.error('Error resizing image:', error);
            throw error;
        }
    }
});



df.app.activity('grayScale', {
    handler : async (context) => {

        try {
            let parts = context.split(';');
            let mimType = parts[0].split(':')[1];

            const uri = context.split(';base64,').pop()

            // Resize the input image to a standard size (e.g., 1024x768 pixels).
            let imgBuffer = Buffer.from(uri, 'base64');
            // Convert the input image to grayscale.
            const grayscaleImageBuffer = await sharp(imgBuffer).grayscale().toBuffer();
            return `data:${mimType};base64,${grayscaleImageBuffer.toString('base64')}`;

        } catch (error) {
            context.log.error('Error converting image to grayscale:', error);
            throw error;
        }
    }
})

df.app.activity('waterMark', {
    handler : async (context) => {
        try {
            console.log('========================== context', context)
            let parts = context.split(';');
            let mimType = parts[0].split(':')[1];

            const uri = context.split(';base64,').pop()
            let imgBuffer = Buffer.from(uri, 'base64');

            // Apply a watermark to the input image.
            const watermarkImagePath = './images/watermark.png'; // Path to your watermark image
            const watermarkedImageBuffer = await sharp(imgBuffer).composite([{ input: watermarkImagePath, gravity: 'southeast' }]).toBuffer();

            const filePath = './images/image-final.jpg'; // Example path, change as needed
            fs.writeFile(filePath, watermarkedImageBuffer, (err) => {
                if (err) {
                    console.error('Error saving image:', err);
                } else {
                    console.log('Image saved successfully');
                }
            });
            
            return `data:${mimType};base64,${watermarkedImageBuffer.toString('base64')}`;

        } catch (error) {
            console.log(error);
            context.log.error('Error applying watermark to image:', error);
            throw error;
        }
    }
})

// Define HTTP trigger function
app.http('ImageManipulatorHttpStart', {
    route: 'orchestrators/ImageManipulatorOrchestrator',
    extraInputs: [df.input.durableClient()],
    handler: async (request, context) => {
        const client = df.getClient(context);

        // Extract image data from the request body

        const requestBody = await request.json();

        // Start the orchestrator function with the image data
        const instanceId = await client.startNew('ImageManipulatorOrchestrator', {
            input : requestBody
        });

        context.log(`Started orchestration with ID = '${instanceId}'.`);

        // Return a response with the instance ID
        return client.createCheckStatusResponse(request, instanceId);
    },
});

