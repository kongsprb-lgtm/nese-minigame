-- Roblox LocalScript (place inside StarterGui or ScreenGui)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local syncEvent = ReplicatedStorage:WaitForChild("SyncEvent")

local player = Players.LocalPlayer

-- Locate GUI components
local screenGui = script.Parent
local syncFrame = screenGui:WaitForChild("SyncFrame")
local codeLabel = syncFrame:WaitForChild("CodeLabel")
local syncButton = syncFrame:WaitForChild("SyncButton")
local statusLabel = syncFrame:WaitForChild("StatusLabel")

-- Set initial GUI visibility
syncFrame.Visible = false

-- Function to handle GUI status messages
local function setStatus(message, isError)
	statusLabel.Text = message
	if isError then
		statusLabel.TextColor3 = Color3.fromRGB(255, 100, 100) -- Light Red
	else
		statusLabel.TextColor3 = Color3.fromRGB(100, 255, 100) -- Light Green
	end
end

-- Listen to server events
syncEvent.OnClientEvent:Connect(function(data)
	if not data then return end

	if data.action == "show_code" then
		-- Show the synchronization interface and display code
		syncFrame.Visible = true
		codeLabel.Text = tostring(data.code)
		setStatus("Waiting for synchronization...", false)
		syncButton.Active = true
		syncButton.Text = "Synchronize"
		
	elseif data.action == "synchronized_status" and data.synchronized == true then
		-- User is already synchronized, hide GUI
		syncFrame.Visible = false
		print("[SyncGui] Profile already synchronized. Points:", data.points)
		
	elseif data.action == "sync_success" then
		-- Account synchronized successfully!
		setStatus("Profile synchronized successfully.", false)
		syncButton.Active = false
		syncButton.Text = "Synchronized"
		
		task.delay(3, function()
			syncFrame.Visible = false
		end)
		
		print("[SyncGui] Synchronization success! points:", data.points, "items:", #data.inventory)
		
	elseif data.action == "sync_failed" then
		-- Synchronization failed, display error
		setStatus("Synchronization failed. Please try again later.", true)
		syncButton.Active = true
		syncButton.Text = "Synchronize"
		
	elseif data.action == "error" then
		-- Global connection/server error
		syncFrame.Visible = true
		codeLabel.Text = "ERROR"
		setStatus(data.message or "Synchronization failed. Please try again later.", true)
		syncButton.Active = false
		syncButton.Text = "Unavailable"
	end
end)

-- Bind synchronization button event
syncButton.MouseButton1Click:Connect(function()
	if not syncButton.Active then return end
	
	syncButton.Active = false
	syncButton.Text = "Syncing..."
	setStatus("Contacting server to synchronize...", false)
	
	-- Fire RemoteEvent to let the Server verify via backend API
	syncEvent:FireServer({
		action = "verify_sync"
	})
end)
