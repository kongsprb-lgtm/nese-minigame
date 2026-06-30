local HttpService = game:GetService("HttpService")

local APIService = {}

-- Configuration (Adjust these values to match your deployment)
local BASE_URL = "http://127.0.0.1:3000"
local API_KEY = "5ba1698a3da896b9de168c2c7afe9e9b17193cbef92bccaf0cf0ef0816b10951"

-- Helper to make HTTP POST requests
local function postRequest(endpoint, bodyData)
	local url = BASE_URL .. endpoint
	local headers = {
		["Content-Type"] = "application/json",
		["x-api-key"] = API_KEY
	}
	
	local success, result = pcall(function()
		return HttpService:PostAsync(url, HttpService:JSONEncode(bodyData), Enum.HttpContentType.ApplicationJson, false, headers)
	end)
	
	if success then
		local ok, decoded = pcall(function()
			return HttpService:JSONDecode(result)
		end)
		if ok then
			return decoded
		else
			warn("[APIService] Failed to decode response JSON: " .. tostring(result))
		end
	else
		warn("[APIService] HTTP POST request failed on " .. endpoint .. ": " .. tostring(result))
	end
	return nil
end

-- Helper to make HTTP GET requests
local function getRequest(endpoint)
	local url = BASE_URL .. endpoint
	local headers = {
		["x-api-key"] = API_KEY
	}
	
	local success, result = pcall(function()
		return HttpService:GetAsync(url, false, headers)
	end)
	
	if success then
		local ok, decoded = pcall(function()
			return HttpService:JSONDecode(result)
		end)
		if ok then
			return decoded
		else
			warn("[APIService] Failed to decode response JSON: " .. tostring(result))
		end
	else
		warn("[APIService] HTTP GET request failed on " .. endpoint .. ": " .. tostring(result))
	end
	return nil
end

-- ==================== PUBLIC API METHODS ====================

-- POST /sync
function APIService:GenerateSyncCode(userId, username)
	local payload = {
		robloxId = tostring(userId),
		username = username
	}
	return postRequest("/sync", payload)
end

-- GET /player/:robloxId
function APIService:GetPlayerData(userId)
	return getRequest("/player/" .. tostring(userId))
end

-- POST /redeem
function APIService:RedeemItem(userId, itemId)
	local payload = {
		robloxId = tostring(userId),
		itemId = itemId
	}
	return postRequest("/redeem", payload)
end

-- GET /inventory/:robloxId
function APIService:SyncInventory(userId)
	return getRequest("/inventory/" .. tostring(userId))
end

return APIService
