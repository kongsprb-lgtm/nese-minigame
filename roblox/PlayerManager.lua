-- Roblox Server Script (place in ServerScriptService)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local APIService = require(script.Parent.APIService) -- Assumes APIService is in the same directory/folder
print("[PlayerManager] Script loaded and running!")

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

-- Ensure TitleSystem Folder and PlayerTitleOperation RemoteFunction exist
local titleSystemFolder = ReplicatedStorage:FindFirstChild("TitleSystem")
if not titleSystemFolder then
	titleSystemFolder = Instance.new("Folder")
	titleSystemFolder.Name = "TitleSystem"
	titleSystemFolder.Parent = ReplicatedStorage
end

local playerTitleOperation = titleSystemFolder:FindFirstChild("PlayerTitleOperation")
if not playerTitleOperation then
	playerTitleOperation = Instance.new("RemoteFunction")
	playerTitleOperation.Name = "PlayerTitleOperation"
	playerTitleOperation.Parent = titleSystemFolder
end

-- Store active session data for players in-memory on the Roblox server
local sessionData = {}

-- Forward declarations of functions
local GetPlayerData
local SyncInventory
local RedeemItem

-- ==================== OVERHEAD TITLE SYSTEM ====================

local function ApplyOverheadTitle(player)
	local character = player.Character
	if not character then return end
	local head = character:WaitForChild("Head", 10)
	if not head then return end
	
	-- Clear existing overhead title
	local oldTitle = head:FindFirstChild("OverheadTitle")
	if oldTitle then
		oldTitle:Destroy()
	end
	
	local data = sessionData[player.UserId]
	if not data or not data.titles then return end
	
	-- Check if we have any active titles configured
	local hasAnyTitle = false
	for _, config in pairs(data.titles) do
		if config.titleText and config.titleText ~= "" then
			hasAnyTitle = true
			break
		end
	end
	if not hasAnyTitle then return end
	
	-- Create BillboardGui
	local billboard = Instance.new("BillboardGui")
	billboard.Name = "OverheadTitle"
	billboard.Size = UDim2.new(0, 250, 0, 60)
	billboard.StudsOffset = Vector3.new(0, 2.5, 0)
	billboard.AlwaysOnTop = true
	billboard.ResetOnSpawn = false
	billboard.Parent = head
	
	local layout = Instance.new("UIListLayout")
	layout.Name = "Layout"
	layout.FillDirection = Enum.FillDirection.Vertical
	layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
	layout.VerticalAlignment = Enum.VerticalAlignment.Bottom
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = billboard
	
	-- Create titles (Slot 15 on top, Slot 13 on bottom)
	local slots = {
		{ id = "15", order = 1 },
		{ id = "13", order = 2 }
	}
	
	for _, slotInfo in ipairs(slots) do
		local config = data.titles[slotInfo.id]
		if config and config.titleText and config.titleText ~= "" then
			local label = Instance.new("TextLabel")
			label.Name = "Slot_" .. slotInfo.id
			label.BackgroundTransparency = 1
			label.Size = UDim2.new(1, 0, 0, 24)
			label.Font = Enum.Font[config.font] or Enum.Font.GothamBold
			label.Text = config.titleText
			label.TextSize = config.textSize or 22
			label.TextStrokeTransparency = 0
			label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
			label.LayoutOrder = slotInfo.order
			
			-- Color parsing
			local r = config.solidColor and config.solidColor.R or 255
			local g = config.solidColor and config.solidColor.G or 255
			local b = config.solidColor and config.solidColor.B or 255
			
			label:SetAttribute("EffectMode", config.mode or "Solid")
			label:SetAttribute("BaseColor", Color3.fromRGB(r, g, b))
			
			label.Parent = billboard
		end
	end
end

-- ==================== SERVER PUBLIC INTERFACE FUNCTIONS ====================

-- Retrieves data for a given player from the database
function GetPlayerData(player)
	if not player or not player:IsA("Player") then return nil end
	
	local response = APIService:GetPlayerData(player.UserId)
	if response and response.success then
		sessionData[player.UserId] = response.player
		
		-- Sync points to LastSummitCount attribute so client UI detects unlocked slots
		player:SetAttribute("LastSummitCount", response.player.points or 0)
		return response.player
	end
	return nil
end

-- Syncs a player's inventory list with the database
function SyncInventory(player)
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
function RedeemItem(player, itemId)
	if not player or not player:IsA("Player") then return false, "Invalid Player" end
	
	local response = APIService:RedeemItem(player.UserId, itemId)
	if response and response.success then
		-- Update local session cache with new point balance and sync inventory
		if sessionData[player.UserId] then
			sessionData[player.UserId].points = response.points
		end
		
		player:SetAttribute("LastSummitCount", response.points or 0)
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

-- ==================== TITLE SYSTEM REMOTE FUNCTION INVOCATION ====================

playerTitleOperation.OnServerInvoke = function(player, action, config)
	-- Always fetch latest data from the database to prevent stale cache issues
	local data = GetPlayerData(player)
	if not data then return false, "Player data not loaded." end
	
	if action == "Get" then
		local allowed = {}
		if data.titles then
			for slotStr, item in pairs(data.titles) do
				local slotNum = tonumber(slotStr)
				if slotNum then
					allowed[slotNum] = {
						titleText = item.titleText,
						font = item.font,
						mode = item.mode,
						textSize = item.textSize,
						solidColor = item.solidColor
					}
				end
			end
		end
		
		local extra = {
			requiredSummit = 25,
			slotsConfig = {
				[13] = 25,
				[15] = 50
			}
		}
		
		return true, allowed, extra
	elseif action == "Set" then
		if not config or not config.slot then return false, "Invalid configuration." end
		local slot = tonumber(config.slot)
		if slot ~= 13 and slot ~= 15 then return false, "Invalid title slot." end
		
		-- Check inventory for "slot_13" or "slot_15"
		local itemId = "slot_" .. slot
		local hasSlot = false
		if data.inventory then
			for _, item in ipairs(data.inventory) do
				if item.id == itemId then
					hasSlot = true
					break
				end
			end
		end
		
		if not hasSlot then
			-- Check points threshold only if they do not own the slot yet
			local reqPoints = (slot == 13) and 25 or 50
			if (data.points or 0) < reqPoints then
				return false, "Dibutuhkan " .. reqPoints .. " point untuk Slot " .. slot .. "!"
			end

			print("[PlayerManager] Purchasing slot: " .. itemId .. " for player " .. player.Name)
			local success, result = RedeemItem(player, itemId)
			if not success then
				return false, "Gagal menukar point: " .. tostring(result)
			end
			-- Refresh local session data reference
			data = sessionData[player.UserId]
		end
		
		-- Save title to cloud database
		print("[PlayerManager] Saving title config for " .. player.Name .. " slot " .. slot)
		local saveResponse = APIService:SaveTitle(player.UserId, slot, config)
		if saveResponse and saveResponse.success then
			data.titles = data.titles or {}
			data.titles[tostring(slot)] = config
			
			-- Render overhead title
			task.spawn(ApplyOverheadTitle, player)
			return true
		else
			return false, "Gagal menyimpan konfigurasi ke cloud."
		end
	elseif action == "Remove" then
		if not config or not config.slot then return false, "Invalid configuration." end
		local slot = tonumber(config.slot)
		
		print("[PlayerManager] Removing title config for " .. player.Name .. " slot " .. slot)
		local removeResponse = APIService:RemoveTitle(player.UserId, slot)
		if removeResponse and removeResponse.success then
			if data.titles then
				data.titles[tostring(slot)] = nil
			end
			
			-- Update overhead title
			task.spawn(ApplyOverheadTitle, player)
			return true
		else
			return false, "Gagal menghapus konfigurasi dari cloud."
		end
	end
	
	return false, "Unknown operation"
end

-- ==================== EVENT HANDLERS ====================

-- Handle when a player joins the game
local function onPlayerAdded(player)
	print("[PlayerManager] Player joined: " .. player.Name .. " (ID: " .. player.UserId .. ")")
	
	-- Connect character spawn to overhead title rendering
	player.CharacterAdded:Connect(function(character)
		task.wait(0.5) -- Wait briefly for character assembly
		ApplyOverheadTitle(player)
	end)
	
	if player.Character then
		task.spawn(ApplyOverheadTitle, player)
	end
	
	-- Attempt to get existing player data
	local playerData = GetPlayerData(player)
	
	if playerData and playerData.linked then
		print("[PlayerManager] Player " .. player.Name .. " is already synchronized.")
		syncEvent:FireClient(player, {
			action = "synchronized_status",
			synchronized = true,
			points = playerData.points,
			inventory = playerData.inventory
		})
	else
		print("[PlayerManager] Player " .. player.Name .. " is not synchronized. Requesting code...")
		local response = APIService:GenerateSyncCode(player.UserId, player.Name)
		
		if response and response.success then
			syncEvent:FireClient(player, {
				action = "show_code",
				synchronized = false,
				code = response.code
			})
		else
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
	
	local playerData = GetPlayerData(player)
	
	if playerData and playerData.linked then
		print("[PlayerManager] Player " .. player.Name .. " synchronization successful!")
		syncEvent:FireClient(player, {
			action = "sync_success",
			synchronized = true,
			points = playerData.points,
			inventory = playerData.inventory
		})
		
		-- Try rendering overhead if character exists
		task.spawn(ApplyOverheadTitle, player)
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
local playerAddedConnection = Players.PlayerAdded:Connect(onPlayerAdded)
local playerRemovingConnection = Players.PlayerRemoving:Connect(onPlayerRemoving)

-- Bind any players already in server (for Studio play testing)
for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
end
