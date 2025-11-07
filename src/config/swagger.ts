import swaggerJsdoc from 'swagger-jsdoc'

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Empreinte Nature Places API',
      version: '1.0.0',
      description:
        'API for managing and analyzing nature places, including web scraping and AI-powered content extraction',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:8080',
        description: 'Development server',
      },
      {
        url: 'https://api.empreinte.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication',
        },
      },
      schemas: {
        PlaceAnalysisResponse: {
          type: 'object',
          properties: {
            placeId: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier of the place',
            },
            placeName: {
              type: 'string',
              description: 'Name of the place',
            },
            website: {
              type: 'string',
              nullable: true,
              description: 'Website URL of the place',
            },
            description: {
              type: 'string',
              description: 'AI-generated detailed description (max 2000 chars)',
              maxLength: 2000,
            },
            mentionedPlaces: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'List of other nature places mentioned in the content',
            },
            scrapedPagesCount: {
              type: 'integer',
              description: 'Number of pages scraped from the website',
            },
          },
          required: [
            'placeId',
            'placeName',
            'website',
            'description',
            'mentionedPlaces',
            'scrapedPagesCount',
          ],
        },
        WikipediaAnalysisResponse: {
          type: 'object',
          properties: {
            placeId: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier of the place',
            },
            placeName: {
              type: 'string',
              description: 'Name of the place',
            },
            wikipediaReference: {
              type: 'string',
              nullable: true,
              description: 'Wikipedia reference used (e.g., "en:Article Name" or "fr:Article Name")',
            },
            description: {
              type: 'string',
              description: 'AI-generated detailed description focused on nature features',
            },
            mentionedPlaces: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'List of other nature places mentioned in the Wikipedia article',
            },
          },
          required: ['placeId', 'placeName', 'description', 'mentionedPlaces'],
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
          required: ['error'],
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: ['./src/index.ts'], // Path to the API docs
}

export const swaggerSpec = swaggerJsdoc(options)
