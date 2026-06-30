-- Roblox Server Script (place in ServerScriptService)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local APIService = require(script.Parent.APIService) -- Assumes APIService is in the same directory/folder

-- Ensure HttpService is enabled
pcall(function()
	HttpService.HttpEnabled = true
end)

-- Retrieve or create the RemoteEvent for UI communication
local syncEvent = ReplicatedStorage:FindFirstChild("SyncEvent")
if not syncEvent then
	syncEvent = Instance.new("RemoteEvent")
	syncEvent.Name = "SyncEvent"
	syncEvent.Parent = ReplicatedStorage
end

-- Store active session data for players in-memory on the Roblox server
local sessionData = {}

-- ==================== SERVER PUBLIC INTERFACE FUNCTIONS ====================

-- Retrieves data for a given player from the database
local function GetPlayerData(player)
	if not player or not player:IsA("Player") then return nil end
	
	local response = APIService:GetPlayerData(player.UserId)
	if response and response.success then
		sessionData[player.UserId] = response.player
		return response.player
	end
	return nil
end

-- Syncs a player's inventory list with the database
local function SyncInventory(player)
	if not player or not player:IsA("Player") then return nil end
	
	local response = APIService:SyncInventory(player.UserId)
	if response and response.success then
		if sessionData[player.UserId] then
			sessionData[player.UserId].inventory = response.inventory
		end
		return response.inventory
	end
	return nil
end

-- Redeems a shop item using the player's points
local function RedeemItem(player, itemId)
	if not player or not player:IsA("Player") then return false, "Invalid Player" end
	
	local response = APIService:RedeemItem(player.UserId, itemId)
	if response and response.success then
		-- Update local session cache with new point balance and sync inventory
		if sessionData[player.UserId] then
			sessionData[player.UserId].points = response.points
		end
		SyncInventory(player)
		
		print("[PlayerManager] Player " .. player.Name .. " successfully redeemed item: " .. itemId)
		return true, response.purchasedItem
	else
		local errMsg = (response and response.error) or "Purchase failed. Check balance or connection."
		warn("[PlayerManager] RedeemItem failed for " .. player.Name .. ": " .. errMsg)
		return false, errMsg
	end
end

-- Expose functions globally for other server scripts
_G.GetPlayerData = GetPlayerData
_G.SyncInventory = SyncInventory
_G.RedeemItem = RedeemItem

-- ==================== EVENT HANDLERS ====================

-- Handle when a player joins the game
local function onPlayerAdded(player)
	print("[PlayerManager] Player joined: " .. player.Name .. " (ID: " .. player.UserId .. ")")
	
	-- Attempt to get existing player data
	local playerData = GetPlayerData(player)
	
	if playerData and playerData.linked then
		print("[PlayerManager] Player " .. player.Name .. " is already synchronized.")
		-- Inform client that the account is already synchronized
		syncEvent:FireClient(player, {
			action = "synchronized_status",
			synchronized = true,
			points = playerData.points,
			inventory = playerData.inventory
		})
	else
		-- Player is not synchronized or has no database profile yet. Generate a synchronization code.
		print("[PlayerManager] Player " .. player.Name .. " is not synchronized. Requesting code...")
		local response = APIService:GenerateSyncCode(player.UserId, player.Name)
		
		if response and response.success then
			-- Send synchronization code to the client GUI
			syncEvent:FireClient(player, {
				action = "show_code",
				synchronized = false,
				code = response.code
			})
		else
			-- Fallback error communication
			syncEvent:FireClient(player, {
				action = "error",
				message = "Failed to connect to API server. Synchronization service unavailable."
			})
		end
	end
end

-- Handle when a player leaves the game
local function onPlayerRemoving(player)
	sessionData[player.UserId] = nil
	print("[PlayerManager] Player left, session cleared: " .. player.Name)
end

-- Handle RemoteEvent synchronization verification requests from client UI
syncEvent.OnServerEvent:Connect(function(player, data)
	if not data or data.action ~= "verify_sync" then return end
	
	print("[PlayerManager] Verification request received from client: " .. player.Name)
	
	-- Query the API to see if the user is now synchronized in database
	local playerData = GetPlayerData(player)
	
	if playerData and playerData.linked then
		print("[PlayerManager] Player " .. player.Name .. " synchronization successful!")
		syncEvent:FireClient(player, {
			action = "sync_success",
			synchronized = true,
			points = playerData.points,
			inventory = playerData.inventory
		})
	else
		print("[PlayerManager] Player " .. player.Name .. " synchronization verification failed.")
		syncEvent:FireClient(player, {
			action = "sync_failed",
			synchronized = false,
			message = "Synchronization failed."
		})
	end
end)

-- Bind join/leave events
Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)

-- Bind any players already in server (for Studio play testing)
for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
end
