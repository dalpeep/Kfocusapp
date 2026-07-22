# DalTownMap v10.1 Google Search Fact Check

## Required Netlify environment variables

- `OPENAI_API_KEY`
- `GOOGLE_SEARCH_API_KEY` — Google Custom Search JSON API key
- `GOOGLE_SEARCH_CX` — Programmable Search Engine ID
- `GOOGLE_MAPS_API_KEY` — optional but strongly recommended for hospital, school, and business place verification

## What changed

- Executes real Google Custom Search queries generated from the user's intent.
- Downloads and reads public text from user-provided URLs.
- Uses Google snippets and readable page text as the only factual evidence for the article.
- Blocks article generation when a supplied URL cannot be read.
- Prohibits invented names, doctors, addresses, phone numbers, reviews, rankings, and costs.
- Uses Google Places as a secondary place-existence check for health, education, and business guides.
- Shows Google result count, URL-read count, and place-verification status in the admin status message.

## Important

Google Custom Search JSON API and Programmable Search Engine must be enabled in Google Cloud. The search engine should be configured to search the entire web. Without the two Google Search variables, guide generation stops instead of silently falling back to AI guessing.
