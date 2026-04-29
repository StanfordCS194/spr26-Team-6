# file to perform web scraping of govt websites

import requests
import json

# 1. Get new bids from the API
def get_new_bids(query):
    url = "https://apitude.co/api/v1.0/requests/cal-eprocure-us/"
    payload = {'name': query}
    headers = {'x-api-key': 'YOUR-API-KEY', 'Content-Type': 'application/json'}
    
    # Trigger request
    post_res = requests.post(url, headers=headers, data=json.dumps(payload))
    request_id = post_res.json().get('request_id')
    
    # Poll for results (add a sleep/retry loop here in production)
    get_url = f"{url}{request_id}/"
    result = requests.get(get_url, headers=headers).json()
    return result['result']['data']['record']