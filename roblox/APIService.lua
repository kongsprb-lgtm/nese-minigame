local HttpService = game:GetService("HttpService")

local APIService = {}

-- Configuration (Adjust these values to match your deployment)
local BASE_URL = "http://127.0.0.1:3000"
local API_KEY = "5ba1698a3da896b9de168c2c7afe9e9b17193cbef92bccaf0cf0ef0816b10951"

-- Helper to make HTTP POST requests
local function postRequest(endpoint, bodyData)
	local url = BASE_URL .. endpoint
	local headers = {
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

-- POST /player/:robloxId/title
function APIService:SaveTitle(userId, slot, config)
	local payload = {
		slot = slot,
		titleText = config.titleText,
		font = config.font,
		mode = config.mode,
		textSize = config.textSize,
		solidColor = config.solidColor
	}
	return postRequest("/player/" .. tostring(userId) .. "/title", payload)
end

-- DELETE /player/:robloxId/title/:slot
function APIService:RemoveTitle(userId, slot)
	local url = BASE_URL .. "/player/" .. tostring(userId) .. "/title/" .. tostring(slot)
	local headers = {
		["x-api-key"] = API_KEY
	}
	
	local success, result = pcall(function()
		return HttpService:RequestAsync({
			Url = url,
			Method = "DELETE",
			Headers = headers
		})
	end)
	
	if success and result.Success then
		local ok, decoded = pcall(function()
			return HttpService:JSONDecode(result.Body)
		end)
		if ok then
			return decoded
		else
			warn("[APIService] Failed to decode response JSON: " .. tostring(result.Body))
		end
	else
		local errMsg = success and (result.StatusCode .. " " .. result.StatusMessage) or tostring(result)
		warn("[APIService] HTTP DELETE request failed on /player/" .. tostring(userId) .. "/title/" .. tostring(slot) .. ": " .. errMsg)
	end
	return nil
end

return APIService
