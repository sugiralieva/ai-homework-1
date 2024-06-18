import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import OpenAI from 'openai';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemPrompt = `
You are a professional tech expert. Provide a detailed reasoning for selecting the best laptop among the given list based on their specifications and ratings. Return the result in JSON format:
{
  "bestLaptop": {
    "name": "Laptop Name",
    "reasoning": "Reasoning for selecting this laptop"
  }
}
`;

const fetchLaptopDetails = async (url: string) => {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(data);

    // Извлекаем данные из ul.short-specifications
    const specs:string[] = [];
    $('ul.short-specifications li.short-specifications__text').each((_, element) => {
      specs.push($(element).text());
    });

    return specs.join(', ');
  } catch (error) {
    // @ts-ignore
    console.error(`Error fetching data from ${url}:`, error.message);
    return null;
  }
};

const main = async (userPrompt: string) => {
  // Считываем данные из JSON файла
  const filePath = path.join(__dirname, 'laptops.json');
  const laptopsData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  for (const laptop of laptopsData) {
    laptop.specs = await fetchLaptopDetails(laptop.url);
  }

  // Формируем список ноутбуков для отправки в OpenAI
  const laptopList = laptopsData.map(laptop => `${laptop.title} (${laptop.specs}, Price: ${laptop.price})`).join('\n');
  const fullPrompt = `${userPrompt}\n${laptopList}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
      response_format: {
        type: 'json_object',
      },
    });

    const resJson: string | null = response.choices[0].message.content;
    if (resJson) {
      try {
        const parsedRes = JSON.parse(resJson);
        console.log(parsedRes.bestLaptop);
      } catch (e: any) {
        console.log('JSON parsing failed:', e.message);
      }
    }
  } catch (e: any) {
    console.log(e.message);
  }
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Please enter your prompt: ', (userPrompt) => {
  main(userPrompt);
  rl.close();
});

app.listen(PORT, () => {
  console.log(`Server runs at http://localhost:${PORT}`);
});
