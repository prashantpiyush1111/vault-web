package vaultWeb.controllers;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import vaultWeb.dtos.PollRequestDto;
import vaultWeb.dtos.PollResponseDto;
import vaultWeb.exceptions.notfound.PrivateChatNotFoundException;
import vaultWeb.models.*;
import vaultWeb.repositories.PrivateChatRepository;
import vaultWeb.services.PollService;
import vaultWeb.services.auth.AuthService;

@RestController
@RequestMapping("/api/private-chats/{privateChatId}/polls")
@RequiredArgsConstructor
public class PrivateChatPollController {

  private final PrivateChatRepository privateChatRepository;
  private final PollService pollService;
  private final AuthService authService;

  /**
   * Creates a new poll in the specified private chat.
   *
   * @param privateChatId the ID of the private chat where the poll will be created
   * @param pollDto the poll data sent in the request body
   * @return the created poll as a PollResponseDto
   */
  @PostMapping("")
  @Operation(
      summary = "Creates a new poll in the specified private chat",
      description =
          """
                This endpoint creates a poll within a specific private chat.
                - 'privatechatId': the ID of the privatechat Id where the poll will be created
                - 'pollDTO': the poll data to be sent in the request body
                """)
  @ApiResponse(responseCode = "201", description = "Poll created successfully.")
  @ApiResponse(
      responseCode = "401",
      description = "Unauthorized request. You must provide an authentication token.")
  public ResponseEntity<PollResponseDto> createPoll(
      @PathVariable Long privateChatId, @RequestBody @Valid PollRequestDto pollDto) {
    User currentUser = authService.getCurrentUser();
    PrivateChat privateChat =
        privateChatRepository
            .findById(privateChatId)
            .orElseThrow(() -> new PrivateChatNotFoundException("Chat not found"));

    PollContext pollContext = new PollContext(null, privateChat);
    Poll poll = pollService.createPoll(pollContext, currentUser, pollDto);

    // Convert to response DTO and return
    PollResponseDto responseDto = pollService.toResponseDto(poll);
    return ResponseEntity.status(HttpStatus.CREATED).body(responseDto);
  }

  /**
   * Casts a vote for a specific poll option.
   *
   * @param pollId the ID of the poll
   * @param optionId the ID of the option being voted for
   * @return HTTP 204 No Content
   */
  @PostMapping("/{pollId}/options/{optionId}/vote")
  @Operation(
      summary = "Casts a vote for a specific poll option",
      description =
          """
                This endpoint casts a vote for some poll conducted within a specific private chat.
                - 'pollId': the ID of the poll
                - 'optionId': the ID of the option being voted for
                """)
  @ApiResponse(responseCode = "204", description = "Vote cast successfully.")
  @ApiResponse(
      responseCode = "401",
      description = "Unauthorized request. You must provide an authentication token.")
  public ResponseEntity<Void> vote(
      @PathVariable Long privateChatId, @PathVariable Long pollId, @PathVariable Long optionId) {
    User currentUser = authService.getCurrentUser();
    pollService.voteInPrivateChat(privateChatId, pollId, optionId, currentUser);
    return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
  }

  /**
   * Updates an existing poll.
   *
   * @param pollId the ID of the poll to update
   * @param pollDto the new poll data
   * @return updated PollResponseDto
   */
  @PutMapping("/{pollId}")
  @Operation(
      summary = "Updates an existing poll",
      description =
          """
                This endpoint updates the state of a poll within a specific private chat.
                - 'pollId': the ID of the poll to update
                """)
  @ApiResponse(responseCode = "200", description = "Poll data updated successfully.")
  @ApiResponse(
      responseCode = "401",
      description = "Unauthorized request. You must provide an authentication token.")
  public ResponseEntity<PollResponseDto> updatePoll(
      @PathVariable Long privateChatId,
      @PathVariable Long pollId,
      @RequestBody @Valid PollRequestDto pollDto) {
    User currentUser = authService.getCurrentUser();
    Poll updatedPoll =
        pollService.updatePollInPrivateChat(privateChatId, pollId, currentUser, pollDto);
    return ResponseEntity.ok(pollService.toResponseDto(updatedPoll));
  }

  /**
   * Deletes a poll from a private chat.
   *
   * @param pollId the ID of the poll to delete
   * @return HTTP 204 No Content
   */
  @DeleteMapping("/{pollId}")
  @Operation(
      summary = "Deletes a poll from a private chat",
      description =
          """
                This endpoint deletes a poll conducted within a specific private chat.
                - 'pollId': the ID of the poll
                """)
  @ApiResponse(responseCode = "204", description = "Poll deleted successfully")
  @ApiResponse(
      responseCode = "401",
      description = "Unauthorized request. You must provide an authentication token.")
  public ResponseEntity<Void> deletePoll(
      @PathVariable Long privateChatId, @PathVariable Long pollId) {
    User currentUser = authService.getCurrentUser();
    pollService.deletePollInPrivateChat(privateChatId, pollId, currentUser);
    return ResponseEntity.noContent().build();
  }

  /**
   * Retrieves all polls of a given private chat.
   *
   * @param privateChatId the ID of the private chat
   * @return list of PollResponseDto objects
   */
  @GetMapping("")
  @Operation(
      summary = "Retrieves all polls of a given private chat",
      description =
          """
                This endpoint returns every poll within a specific private chat.
                - 'privateChatId': the ID of the private chat to retrieve all polls from
                """)
  @ApiResponse(responseCode = "200", description = "Polls retrieved successfully.")
  @ApiResponse(
      responseCode = "401",
      description = "Unauthorized request. You must provide an authentication token.")
  public ResponseEntity<List<PollResponseDto>> getPolls(@PathVariable Long privateChatId) {
    User currentUser = authService.getCurrentUser();
    List<PollResponseDto> polls =
        pollService.getPollsByPrivateChat(privateChatId, currentUser).stream()
            .map(pollService::toResponseDto)
            .toList();
    return ResponseEntity.ok(polls);
  }
}
